//! Live browser build (feature `render`): full Bevy `DefaultPlugins` -> WebGL2.
//!
//! Two skins, both fully procedural (no bundled image assets): a flat top-down 2D
//! retro skin (works on every device incl. software WebGL2) and a real PBR 3D arena
//! (hardware GPU). Both render the SAME shared deterministic `sim`; neither touches
//! it, so live + headless replay still agree.

use bevy::asset::RenderAssetUsages;
use bevy::camera::ScalingMode;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::image::{Image, ImageAddressMode, ImageSampler, ImageSamplerDescriptor};
use bevy::math::primitives::{Capsule3d, Circle, Cuboid, Cylinder, Sphere};
use bevy::post_process::bloom::Bloom;
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};
use bevy::render::view::Hdr;
use bevy::window::PrimaryWindow;
use wasm_bindgen::prelude::*;

use crate::sim::{
    spawn_sim, tick_schedule, Ball, Brick, Cfg, Half, Level, Paddle, PendingInput, Phase, Pos,
    SimConfig, Status, FP, TICK_HZ,
};

const SCALE: f32 = 2.0;
const STEP: f32 = 1.0 / TICK_HZ as f32;
const MAX_STEPS_PER_FRAME: u32 = 5;

#[derive(Resource)]
struct TickSched(Schedule);

#[derive(Resource, Default)]
struct Accum(f32);

#[derive(Resource, Default)]
struct Recorder {
    bytes: Vec<u8>,
    prev_dir: i32,
    started: bool,
    finished: bool,
}

#[derive(Resource)]
struct RenderRng(u32);

impl RenderRng {
    fn next(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    fn frange(&mut self, a: f32, b: f32) -> f32 {
        a + (self.next() as f32 / u32::MAX as f32) * (b - a)
    }
}


/// True when rendering the real 3D arena (3D skin on a hardware GPU).
#[derive(Resource, Clone, Copy)]
struct Is3d(bool);

/// 3D extrusion height of a brick block (tall enough to read as a 3D block).
const BRICK_H3: f32 = 28.0;
/// Strong saturated arcade brick colors (red, blue, green, purple, yellow, orange).
const ARCADE: [(f32, f32, f32); 6] = [
    (0.92, 0.12, 0.14),
    (0.12, 0.38, 0.96),
    (0.12, 0.74, 0.22),
    (0.66, 0.16, 0.86),
    (0.98, 0.84, 0.10),
    (0.98, 0.48, 0.06),
];

/// Procedural red "cylinder" bar for the flat paddle: a horizontal stadium (rounded
/// caps) shaded across its short axis (bright center line -> dark rim) so it reads as
/// a cylinder lying on its side, the flat top-down match for the 3D capsule paddle.
fn make_cyl_bar(w: u32, h: u32, color: Color) -> Image {
    let c = color.to_srgba();
    let cx = (w as f32 - 1.0) / 2.0;
    let cy = (h as f32 - 1.0) / 2.0;
    let r = h as f32 / 2.0;
    let bx = (w as f32 / 2.0 - r).max(0.0); // box half-width inside the round caps
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            // stadium signed distance (rounded box, corner radius = r, box = (bx, 0)).
            let qx = (x as f32 - cx).abs() - bx;
            let qy = (y as f32 - cy).abs();
            let d = (qx.max(0.0).hypot(qy.max(0.0))) + qx.max(qy).min(0.0) - r;
            let alpha = (0.5 - d).clamp(0.0, 1.0); // ~1px antialiased edge
            // cylinder cross-section shading along the short (y) axis + a soft highlight.
            let ny = ((y as f32 - cy) / r).clamp(-1.0, 1.0);
            let diff = (1.0 - ny * ny).max(0.0).sqrt();
            let spec = (-(ny + 0.35).abs() * 3.0).exp() * 0.35;
            let shade = (0.42 + 0.6 * diff + spec).min(1.35);
            data.extend_from_slice(&[
                (c.red * shade * 255.0).min(255.0) as u8,
                (c.green * shade * 255.0).min(255.0) as u8,
                (c.blue * shade * 255.0).min(255.0) as u8,
                (alpha * 255.0) as u8,
            ]);
        }
    }
    rgba_image(w, h, data)
}

/// Procedural filled disc with a soft 1px rim (the flat 2D ball; no bundled image).
fn make_disc(color: Color) -> Image {
    let n = 64u32;
    let c = color.to_srgba();
    let cx = (n as f32 - 1.0) / 2.0;
    let mut data = Vec::with_capacity((n * n * 4) as usize);
    for y in 0..n {
        for x in 0..n {
            let dx = (x as f32 - cx) / cx;
            let dy = (y as f32 - cx) / cx;
            let r = (dx * dx + dy * dy).sqrt();
            let a = ((0.98 - r) / 0.06).clamp(0.0, 1.0);
            data.extend_from_slice(&[
                (c.red * 255.0) as u8,
                (c.green * 255.0) as u8,
                (c.blue * 255.0) as u8,
                (a * 255.0) as u8,
            ]);
        }
    }
    rgba_image(n, n, data)
}

fn rgba_image(w: u32, h: u32, data: Vec<u8>) -> Image {
    Image::new(
        Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::RENDER_WORLD,
    )
}

/// Procedural tech-grid floor texture: a base color with brighter cell lines.
fn make_grid(base: Color, line: Color, cells: u32) -> Image {
    let n = 512u32;
    let cell = n / cells;
    let bs = base.to_srgba();
    let ls = line.to_srgba();
    let mut data = Vec::with_capacity((n * n * 4) as usize);
    for y in 0..n {
        for x in 0..n {
            let edge = (x % cell < 2) || (y % cell < 2);
            let c = if edge { ls } else { bs };
            data.extend_from_slice(&[
                (c.red * 255.0) as u8,
                (c.green * 255.0) as u8,
                (c.blue * 255.0) as u8,
                255,
            ]);
        }
    }
    rgba_image(n, n, data)
}

/// Procedural starfield: uniform deep-space backdrop with scattered star dots.
/// Background is flat (no gradient) so the texture tiles seamlessly across the
/// flat star backdrop with no visible wrap bands.
fn make_stars(seed: u32) -> Image {
    let w = 512u32;
    let h = 512u32;
    let mut rng = seed | 1;
    let mut next = || {
        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        rng
    };
    // Flat near-black space blue. No vertical gradient -> seamless tiling on the backdrop.
    let mut data = vec![0u8; (w * h * 4) as usize];
    for i in (0..data.len()).step_by(4) {
        data[i] = 5;
        data[i + 1] = 6;
        data[i + 2] = 18;
        data[i + 3] = 255;
    }
    let put = |data: &mut [u8], x: u32, y: u32, r: u8, g: u8, b: u8| {
        let x = x % w;
        let y = y % h;
        let i = ((y * w + x) * 4) as usize;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
    };
    // Dense field of small stars.
    for _ in 0..900 {
        let x = next() % w;
        let y = next() % h;
        let v = 150 + (next() % 90) as u8;
        put(&mut data, x, y, v, v, 255.min(v as u32 + 25) as u8);
    }
    // Sparse brighter 2x2 stars for depth.
    for _ in 0..120 {
        let x = next() % w;
        let y = next() % h;
        for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
            put(&mut data, x + dx, y + dy, 255, 255, 255);
        }
    }
    let mut img = rgba_image(w, h, data);
    // tile the texture across the big backdrop quad so stars stay small + crisp.
    img.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: ImageAddressMode::Repeat,
        address_mode_v: ImageAddressMode::Repeat,
        ..default()
    });
    img
}

/// Shared mesh + material for the fake floor shadows.
#[derive(Resource, Clone)]
struct ShadowArt {
    mesh: Handle<Mesh>,
    mat: Handle<StandardMaterial>,
}

/// A flat shadow quad lying on the floor, beneath an object of the given footprint.
/// `parent_y` is the object's height (the child sits back down on the floor).
fn shadow_bundle(art: &ShadowArt, parent_y: f32, w: f32, d: f32) -> impl Bundle {
    (
        Mesh3d(art.mesh.clone()),
        MeshMaterial3d(art.mat.clone()),
        Transform {
            translation: Vec3::new(0.0, -parent_y + 0.7, 0.0),
            rotation: Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
            scale: Vec3::new(w, d, 1.0),
        },
    )
}

#[derive(Component)]
struct Particle {
    vx: f32,
    vy: f32,
    life: f32,
    max: f32,
}

/// Latches a launch keypress until a sim step actually consumes it. A frame can
/// accumulate less than one fixed step (no sub-step runs), and `just_pressed`
/// only lasts one frame, so the raw edge would be dropped -> Space "not firing".
#[derive(Resource, Default)]
struct LaunchLatch(bool);

/// Flat 2D star backdrop (rendered by the order -1 camera in the 3D skin).
#[derive(Component)]
struct StarBg;

/// A single 3D smash-debris cube: flies outward, falls, shrinks, then despawns.
/// 3D analog of the 2D `Particle`, spawned when a brick breaks.
#[derive(Component)]
struct Debris {
    vel: Vec3,
    spin: Vec3,
    life: f32,
    max: f32,
}

/// Pre-built mesh + glowing material for smash debris (built once in `setup_3d`,
/// so the break hot path only spawns entities, never creates assets).
#[derive(Resource, Clone)]
struct DebrisArt {
    mesh: Handle<Mesh>,
    mat: Handle<StandardMaterial>,
}

struct Snap {
    bricks: u32,
    level: u32,
    lives: u32,
    vy: i32,
    stuck: bool,
    bx: f32,
    by: f32,
}

fn color_u32(c: u32) -> Color {
    Color::srgb_u8(((c >> 16) & 0xff) as u8, ((c >> 8) & 0xff) as u8, (c & 0xff) as u8)
}

/// Multiply an sRGB color's channels by `f` (per-row brick shading on a single tint).
fn scale_color(c: Color, f: f32) -> Color {
    let s = c.to_srgba();
    Color::srgb((s.red * f).min(1.0), (s.green * f).min(1.0), (s.blue * f).min(1.0))
}

/// Color for a brick row, shared by both skins: the default multi-color ARCADE wall,
/// or, when the skin sets a brick color, that single hue shaded per row for depth.
fn brick_color(tint: Option<Color>, row: usize, level: usize) -> Color {
    let idx = (row + level) % ARCADE.len();
    match tint {
        Some(c) => scale_color(c, 1.0 - 0.09 * (idx % 5) as f32),
        None => {
            let (r, g, b) = ARCADE[idx];
            Color::srgb(r, g, b)
        }
    }
}

/// Tiled star-field backdrop sprite (flat, behind everything). Shared by both skins.
fn star_sprite(stars: Handle<Image>, size: f32) -> Sprite {
    Sprite {
        image: stars,
        image_mode: SpriteImageMode::Tiled { tile_x: true, tile_y: true, stretch_value: 1.0 },
        custom_size: Some(Vec2::splat(size)),
        ..default()
    }
}

/// Top-down brick render footprint (width, depth/height) from the sim half-extent,
/// with small gaps so bricks read as separate tiles. Shared by both brick systems.
fn brick_footprint(half: &Half) -> (f32, f32) {
    let w = (half.hx * 2) as f32 / FP as f32 * SCALE - 2.0;
    let d = ((half.hy * 2) as f32 / FP as f32 * SCALE - 1.0).max(6.0);
    (w, d)
}

/// `paletteFromSkin` (game.ts) packs each key as 0xRRGGBB, or this sentinel when the
/// customer left that key unset -> the baked default (or, for brick, the ARCADE wall).
const PAL_UNSET: u32 = 0xFFFF_FFFF;

/// Resolved render colors from ctx.skin. Every key is independently overridable; an
/// unset key keeps the game's default. `brick == None` keeps the multi-color ARCADE
/// wall; `Some(c)` recolors the whole wall to one hue (shaded per row for depth).
#[derive(Resource, Clone, Copy)]
struct Palette {
    bg: Color,
    brick: Option<Color>,
    ball: Color,
    paddle: Color,
    accent: Color,
}

fn resolve_palette(palette: &[u32]) -> Palette {
    let pick = |i: usize, default: u32| match palette.get(i) {
        Some(&v) if v != PAL_UNSET => color_u32(v),
        _ => color_u32(default),
    };
    let brick = match palette.get(1) {
        Some(&v) if v != PAL_UNSET => Some(color_u32(v)),
        _ => None,
    };
    Palette {
        bg: pick(0, 0x0e1424),
        brick,
        ball: pick(2, 0xe6f2ff),
        paddle: pick(3, 0xe6292e),
        accent: pick(4, 0xffd23f),
    }
}

#[wasm_bindgen]
pub fn start(seed: Vec<u32>, cfg: Vec<i32>, mode: u32, palette: Vec<u32>) {
    let mut s = [0u32; 4];
    for (i, v) in seed.iter().take(4).enumerate() {
        s[i] = *v;
    }
    let config = if cfg.is_empty() {
        SimConfig::default()
    } else {
        SimConfig::from_ints(&cfg)
    };
    // palette = [background, brick, ball, paddle, accent] from ctx.skin; each key is
    // independently overridable, unset keys (PAL_UNSET) keep the baked defaults.
    let pal = resolve_palette(&palette);
    let rng_seed = (s[0] ^ s[1].rotate_left(7) ^ s[2] ^ s[3]) | 1;

    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            canvas: Some("#wallsmash".to_string()),
            fit_canvas_to_parent: true,
            ..default()
        }),
        ..default()
    }));
    let is3d = mode == 2;
    app.insert_resource(ClearColor(pal.bg));
    app.insert_resource(pal);
    app.insert_resource(Is3d(is3d));

    spawn_sim(app.world_mut(), config, s);
    app.insert_resource(TickSched(tick_schedule()));
    app.insert_resource(Accum::default());
    app.insert_resource(Recorder::default());
    app.insert_resource(RenderRng(rng_seed));
    app.insert_resource(LaunchLatch::default());

    if is3d {
        app.add_systems(Startup, setup_3d);
        app.add_systems(
            Update,
            (
                skin_bricks_3d,
                frame_camera_3d,
                drive,
                sync_3d,
                sync_floor_shadows,
                update_debris_3d,
                fit_star_bg,
            )
                .chain(),
        );
    } else {
        app.add_systems(Startup, setup_scene);
        app.add_systems(Update, (skin_bricks, drive, sync_positions, update_particles).chain());
    }
    app.run();
}

/// world subunits -> world px (sim origin top-left y-down; Bevy center y-up).
fn to_px(pos: &Pos, cfg: &SimConfig) -> Vec2 {
    let x = (pos.x as f32 / FP as f32 - cfg.arena_w as f32 / 2.0) * SCALE;
    let y = (cfg.arena_h as f32 / 2.0 - pos.y as f32 / FP as f32) * SCALE;
    Vec2::new(x, y)
}

/// Retro skin: a completely FLAT, top-down read of the same arena the 3D skin
/// builds. Same palette (blue grid floor, grey rails, ARCADE brick colors, red
/// paddle, glowing ball, star backdrop), drawn as solid sprites with no lighting,
/// no depth, no bundled images (every texture here is procedural).
fn setup_scene(
    mut commands: Commands,
    cfg: Res<Cfg>,
    pal: Res<Palette>,
    mut images: ResMut<Assets<Image>>,
    paddles: Query<Entity, With<Paddle>>,
    balls: Query<(Entity, &Half), With<Ball>>,
) {
    let c = cfg.0;
    let aw = c.arena_w as f32 * SCALE;
    let ah = c.arena_h as f32 * SCALE;

    // Flat top-down camera; AutoMin keeps the whole arena (+rail margin) framed at
    // any aspect, so the retro skin is responsive like the 3D one.
    commands.spawn((
        Camera2d,
        Msaa::Off,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::AutoMin { min_width: aw + 36.0, min_height: ah + 36.0 },
            ..OrthographicProjection::default_2d()
        }),
    ));

    // Star backdrop: same procedural starfield as the 3D skin, tiled flat behind all.
    // This camera is arena-unit ortho (AutoMin), so size in world units; a generous
    // multiplier covers wide viewports (it can't use the 3D skin's pixel-space fit).
    commands.spawn((
        star_sprite(images.add(make_stars(0x51A4)), aw.max(ah) * 3.0),
        Transform::from_xyz(0.0, 0.0, -20.0),
    ));

    // Blue grid play-field (same texture the 3D floor uses) = the flat arena.
    let grid = images.add(make_grid(Color::srgb(0.07, 0.18, 0.40), Color::srgb(0.20, 0.46, 0.80), 16));
    commands.spawn((
        Sprite { image: grid, custom_size: Some(Vec2::new(aw, ah)), ..default() },
        Transform::from_xyz(0.0, 0.0, -10.0),
    ));

    // Grey border rails (left, right, top) - flat read of the 3D pipe rails.
    let rail = Color::srgb(0.46, 0.47, 0.51);
    let t = 8.0;
    let bar = |w: f32, h: f32, x: f32, y: f32| {
        (
            Sprite { color: rail, custom_size: Some(Vec2::new(w, h)), ..default() },
            Transform::from_xyz(x, y, -5.0),
        )
    };
    commands.spawn(bar(t, ah + t * 2.0, -(aw * 0.5 + t * 0.5), 0.0));
    commands.spawn(bar(t, ah + t * 2.0, aw * 0.5 + t * 0.5, 0.0));
    commands.spawn(bar(aw + t * 2.0, t, 0.0, ah * 0.5 + t * 0.5));

    // Paddle: cylinder bar (flat read of the 3D capsule), skin paddle color. Texture
    // aspect matches the sprite so the round caps stay circular (no stretch).
    if let Ok(e) = paddles.single() {
        let pw = c.paddle_w as f32 * SCALE;
        let ph = c.paddle_h as f32 * SCALE * 2.4;
        let th = 64u32;
        let tw = (th as f32 * (pw / ph)).round().max(th as f32) as u32;
        let bar = images.add(make_cyl_bar(tw, th, pal.paddle));
        commands.entity(e).insert((
            Sprite { image: bar, custom_size: Some(Vec2::new(pw, ph)), ..default() },
            Transform::from_xyz(0.0, 0.0, 3.0),
        ));
    }
    // Ball: flat disc in the skin ball color.
    if let Ok((e, half)) = balls.single() {
        let d = (half.hx * 2) as f32 / FP as f32 * SCALE * 2.0;
        let disc = images.add(make_disc(pal.ball));
        commands.entity(e).insert((
            Sprite { image: disc, custom_size: Some(Vec2::splat(d)), ..default() },
            Transform::from_xyz(0.0, 0.0, 4.0),
        ));
    }
}

fn skin_bricks(
    mut commands: Commands,
    cfg: Res<Cfg>,
    pal: Res<Palette>,
    level: Res<Level>,
    q: Query<(Entity, &Pos, &Half), (With<Brick>, Without<Sprite>)>,
) {
    let c = cfg.0;
    for (e, pos, half) in &q {
        // Same per-row wall as the 3D bricks, so retro is a flat recolor of the exact
        // same wall (default ARCADE, or the skin brick tint).
        let row = (pos.y / (FP * 10)).max(0) as usize;
        let col = brick_color(pal.brick, row, level.0 as usize);
        let (w, h) = brick_footprint(half);
        let p = to_px(pos, &c);
        commands.entity(e).insert((
            Sprite { color: col, custom_size: Some(Vec2::new(w, h)), ..default() },
            Transform::from_xyz(p.x, p.y, 1.0),
        ));
    }
}

fn sync_positions(cfg: Res<Cfg>, mut q: Query<(&Pos, &mut Transform)>) {
    let c = cfg.0;
    for (pos, mut t) in &mut q {
        let p = to_px(pos, &c);
        t.translation.x = p.x;
        t.translation.y = p.y;
    }
}

fn update_particles(
    time: Res<Time>,
    mut commands: Commands,
    mut q: Query<(Entity, &mut Transform, &mut Sprite, &mut Particle)>,
) {
    let dt = time.delta_secs();
    for (e, mut t, mut sp, mut p) in &mut q {
        p.life += dt;
        if p.life >= p.max {
            commands.entity(e).despawn();
            continue;
        }
        t.translation.x += p.vx * dt;
        t.translation.y += p.vy * dt;
        let a = (1.0 - p.life / p.max).clamp(0.0, 1.0);
        sp.color.set_alpha(a);
    }
}

// ---- 3D arena (3D skin, real GPU) --------------------------------------------

/// sim (x,y) -> 3D floor (x, z): bricks sit far (-z), the paddle near the camera (+z).
fn to_floor(pos: &Pos, cfg: &SimConfig) -> (f32, f32) {
    let x = (pos.x as f32 / FP as f32 - cfg.arena_w as f32 / 2.0) * SCALE;
    let z = (pos.y as f32 / FP as f32 - cfg.arena_h as f32 / 2.0) * SCALE;
    (x, z)
}

fn lit(base: Color, metallic: f32, rough: f32) -> StandardMaterial {
    StandardMaterial { base_color: base, metallic, perceptual_roughness: rough, ..default() }
}

/// Vertical FOV of the 3D arena camera (radians). Wider = stronger perspective
/// recession (the receding floor that reads as 3D), camera comes in closer.
const CAM_FOV: f32 = 0.92;
/// View direction (camera sits along this from the arena centroid). Lower Y = more
/// tilted / lower-angle view across the arena (closer to the reference).
fn cam_dir() -> Vec3 {
    // viewed from the top-right corner (like the reference): +x right, +y up, +z near.
    Vec3::new(0.52, 0.55, 0.66).normalize()
}
fn cam_target(ah: f32) -> Vec3 {
    Vec3::new(0.0, BRICK_H3 * 0.5, ah * 0.02)
}

fn setup_3d(
    mut commands: Commands,
    cfg: Res<Cfg>,
    pal: Res<Palette>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
    paddles: Query<Entity, With<Paddle>>,
    balls: Query<(Entity, &Half), With<Ball>>,
) {
    let c = cfg.0;
    let aw = c.arena_w as f32 * SCALE;
    let ah = c.arena_h as f32 * SCALE;

    // Perspective camera (the receding floor = the 3D look). `frame_camera_3d`
    // re-positions it each frame to fit the arena to the current viewport aspect,
    // so it stays framed + responsive as the iframe resizes.
    commands.spawn((
        Camera3d::default(),
        // Draw on top of the order -1 star camera without erasing it.
        Camera { order: 0, clear_color: ClearColorConfig::None, ..default() },
        Hdr,
        Tonemapping::AcesFitted,
        Bloom::NATURAL,
        Msaa::Off,
        AmbientLight { brightness: 75.0, ..default() },
        Projection::Perspective(PerspectiveProjection { fov: CAM_FOV, ..default() }),
        Transform::from_translation(cam_target(ah) + cam_dir() * ah * 3.0).looking_at(cam_target(ah), Vec3::Y),
    ));
    // Angled key light for face shading. Real-time shadows OFF: the star dome would
    // cast a huge band across the floor, and we use fake blob shadows on the ground.
    commands.spawn((
        DirectionalLight { illuminance: 9500.0, shadows_enabled: false, ..default() },
        Transform::from_xyz(-aw * 0.55, ah * 0.8, ah * 0.45).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Contained play-field floor (arena-sized + a small lip, NOT the whole screen),
    // receives shadows. The space around it is the starfield.
    let grid = images.add(make_grid(Color::srgb(0.07, 0.18, 0.40), Color::srgb(0.20, 0.46, 0.80), 16));
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(aw + 28.0, 9.0, ah + 28.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::WHITE,
            base_color_texture: Some(grid),
            metallic: 0.15,
            perceptual_roughness: 0.7,
            ..default()
        })),
        Transform::from_xyz(0.0, -4.5, 0.0),
    ));

    // Starfield: a FLAT 2D backdrop on a separate camera that renders behind the 3D
    // arena (order -1), so the stars are always orthogonal to the view and never warp
    // the way a wrapped 3D dome did. The star texture is tiled at native size for
    // small, crisp, evenly distributed dots; `fit_star_bg` keeps it covering the
    // viewport as the iframe resizes.
    // Pre-build the smash-debris art (accent-tinted glow so bloom catches it).
    commands.insert_resource(DebrisArt {
        mesh: meshes.add(Cuboid::new(3.4, 3.4, 3.4)),
        mat: materials.add(StandardMaterial {
            base_color: pal.accent,
            emissive: LinearRgba::from(pal.accent) * 2.5,
            ..default()
        }),
    });

    commands.spawn((Camera2d, Camera { order: -1, ..default() }));
    commands.spawn((
        star_sprite(images.add(make_stars(0x51A4)), 2048.0),
        Transform::from_xyz(0.0, 0.0, -10.0),
        StarBg, // fit_star_bg resizes this to the viewport (this camera is pixel-space)
    ));

    // Fake floor shadows (reliable on any GPU, unlike the real-time shadow pass):
    // soft dark blobs that lie on the floor under each object.
    let art = ShadowArt {
        mesh: meshes.add(Circle::new(0.5)),
        mat: materials.add(StandardMaterial {
            base_color: Color::srgb(0.012, 0.035, 0.10),
            unlit: true,
            double_sided: true,
            cull_mode: None,
            ..default()
        }),
    };

    // Rounded pipe rails (cylinders) on the left, right, and far edges, each with a
    // shadow strip on the floor.
    let rail = materials.add(lit(Color::srgb(0.46, 0.47, 0.51), 0.8, 0.35));
    let rr = 9.0;
    let zlen = ah + rr * 2.0;
    for sx in [-1.0_f32, 1.0] {
        commands.spawn((
            Mesh3d(meshes.add(Cylinder { radius: rr, half_height: zlen * 0.5 })),
            MeshMaterial3d(rail.clone()),
            Transform::from_xyz(sx * (aw * 0.5 + rr), rr, 0.0)
                .with_rotation(Quat::from_rotation_x(std::f32::consts::FRAC_PI_2)),
        ));
        commands.spawn((
            Mesh3d(art.mesh.clone()),
            MeshMaterial3d(art.mat.clone()),
            Transform {
                translation: Vec3::new(sx * (aw * 0.5 + rr) + 6.0, 0.7, 4.0),
                rotation: Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
                scale: Vec3::new(rr * 3.0, zlen, 1.0),
            },
        ));
    }
    commands.spawn((
        Mesh3d(meshes.add(Cylinder { radius: rr, half_height: (aw + rr * 2.0) * 0.5 })),
        MeshMaterial3d(rail.clone()),
        Transform::from_xyz(0.0, rr, -(ah * 0.5 + rr))
            .with_rotation(Quat::from_rotation_z(std::f32::consts::FRAC_PI_2)),
    ));
    commands.spawn((
        Mesh3d(art.mesh.clone()),
        MeshMaterial3d(art.mat.clone()),
        Transform {
            translation: Vec3::new(0.0, 0.7, -(ah * 0.5 + rr) + 6.0),
            rotation: Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
            scale: Vec3::new(aw + rr * 2.0, rr * 3.0, 1.0),
        },
    ));

    // Paddle = a rounded capsule lying along X, skin paddle color with accent under-glow.
    if let Ok(e) = paddles.single() {
        let pr = c.paddle_h as f32 * SCALE * 1.2;
        let hl = ((c.paddle_w as f32 * SCALE - pr * 2.0).max(2.0)) * 0.5;
        commands.entity(e).insert((
            Mesh3d(meshes.add(Capsule3d { radius: pr, half_length: hl })),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: pal.paddle,
                emissive: LinearRgba::from(pal.accent) * 0.12,
                metallic: 0.65,
                perceptual_roughness: 0.28,
                ..default()
            })),
            Transform::from_xyz(0.0, pr, 0.0).with_rotation(Quat::from_rotation_z(std::f32::consts::FRAC_PI_2)),
        ));
        spawn_floor_shadow(&mut commands, &art, FloorShadow::Paddle, c.paddle_w as f32 * SCALE * 1.05, pr * 2.6);
    }
    if let Ok((e, half)) = balls.single() {
        let r = half.hx as f32 / FP as f32 * SCALE * 2.1;
        // ride above the floor / paddle so the ball is clearly visible, esp. when stuck.
        let by = (c.paddle_h as f32 * SCALE * 1.2).max(r) + r * 0.4;
        commands.entity(e).insert((
            Mesh3d(meshes.add(Sphere::new(r))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: pal.ball,
                // bright self-glow tinted by the ball color (bloom catches it).
                emissive: LinearRgba::from(pal.ball) * 2.8,
                metallic: 0.3,
                perceptual_roughness: 0.2,
                ..default()
            })),
            Transform::from_xyz(0.0, by, 0.0),
        ));
        spawn_floor_shadow(&mut commands, &art, FloorShadow::Ball, r * 2.4, r * 2.4);
    }

    commands.insert_resource(art);
}

#[derive(Component, Clone, Copy)]
enum FloorShadow {
    Ball,
    Paddle,
}

fn spawn_floor_shadow(commands: &mut Commands, art: &ShadowArt, which: FloorShadow, w: f32, d: f32) {
    commands.spawn((
        Mesh3d(art.mesh.clone()),
        MeshMaterial3d(art.mat.clone()),
        Transform {
            translation: Vec3::new(0.0, 0.7, 0.0),
            rotation: Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
            scale: Vec3::new(w, d, 1.0),
        },
        which,
    ));
}

/// Keep the ball/paddle floor shadows under their objects (they don't move with the
/// objects automatically since they aren't children — the paddle is rotated).
fn sync_floor_shadows(
    cfg: Res<Cfg>,
    balls: Query<&Pos, With<Ball>>,
    paddles: Query<&Pos, With<Paddle>>,
    mut shadows: Query<(&FloorShadow, &mut Transform)>,
) {
    let c = cfg.0;
    let bp = balls.single().ok().map(|p| to_floor(p, &c));
    let pp = paddles.single().ok().map(|p| to_floor(p, &c));
    for (which, mut t) in &mut shadows {
        let src = match which {
            FloorShadow::Ball => bp,
            FloorShadow::Paddle => pp,
        };
        if let Some((x, z)) = src {
            t.translation.x = x;
            t.translation.z = z;
        }
    }
}

/// Responsive perspective framing: each frame, position the camera so the arena's
/// bounding sphere fits the current viewport aspect. Replaces a fixed camera, so the
/// scene re-frames automatically when the iframe resizes.
fn frame_camera_3d(
    cfg: Res<Cfg>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut cam: Query<&mut Transform, With<Camera3d>>,
) {
    let Ok(win) = windows.single() else { return };
    let aspect = (win.width() / win.height().max(1.0)).max(0.25);
    let c = cfg.0;
    let aw = c.arena_w as f32 * SCALE;
    let ah = c.arena_h as f32 * SCALE;
    let r = ((aw * 0.5).hypot(ah * 0.5)) * 1.2 + BRICK_H3;
    let half_y = (CAM_FOV * 0.5).tan();
    let fov_x = 2.0 * (half_y * aspect).atan();
    let d = (r / (CAM_FOV * 0.5).sin()).max(r / (fov_x * 0.5).sin());
    let target = cam_target(ah);
    if let Ok(mut t) = cam.single_mut() {
        *t = Transform::from_translation(target + cam_dir() * d).looking_at(target, Vec3::Y);
    }
}

fn skin_bricks_3d(
    mut commands: Commands,
    cfg: Res<Cfg>,
    pal: Res<Palette>,
    level: Res<Level>,
    art: Res<ShadowArt>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    q: Query<(Entity, &Pos, &Half), (With<Brick>, Without<Mesh3d>)>,
) {
    let c = cfg.0;
    for (e, pos, half) in &q {
        let row = (pos.y / (FP * 10)).max(0) as usize;
        let col = brick_color(pal.brick, row, level.0 as usize);
        let lin = col.to_linear();
        let (w, d) = brick_footprint(half);
        let (x, z) = to_floor(pos, &c);
        commands
            .entity(e)
            .insert((
                Mesh3d(meshes.add(Cuboid::new(w, BRICK_H3, d))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: col,
                    // tiny self-illum keeps colors vivid without killing the shading
                    emissive: LinearRgba::rgb(lin.red * 0.08, lin.green * 0.08, lin.blue * 0.08),
                    metallic: 0.05,
                    perceptual_roughness: 0.35,
                    ..default()
                })),
                Transform::from_xyz(x, BRICK_H3 / 2.0, z),
            ))
            .with_children(|p| {
                p.spawn(shadow_bundle(&art, BRICK_H3 / 2.0, w * 1.08, d * 1.2));
            });
    }
}

/// 3D position sync: sim (x,y) -> floor (x, z); keeps each entity's spawn height (y).
fn sync_3d(cfg: Res<Cfg>, mut q: Query<(&Pos, &mut Transform)>) {
    let c = cfg.0;
    for (pos, mut t) in &mut q {
        let (x, z) = to_floor(pos, &c);
        t.translation.x = x;
        t.translation.z = z;
    }
}

// ---- input + driver (shared) --------------------------------------------------

fn read_input(world: &mut World) -> (i32, bool) {
    let mut dir = 0;
    let mut launch;
    {
        let keys = world.resource::<ButtonInput<KeyCode>>();
        if keys.pressed(KeyCode::ArrowLeft) || keys.pressed(KeyCode::KeyA) {
            dir -= 1;
        }
        if keys.pressed(KeyCode::ArrowRight) || keys.pressed(KeyCode::KeyD) {
            dir += 1;
        }
        launch = keys.just_pressed(KeyCode::Space) || keys.just_pressed(KeyCode::ArrowUp);
    }
    let (touch_just, touch_x) = {
        let touches = world.resource::<Touches>();
        (touches.any_just_pressed(), touches.iter().next().map(|t| t.position().x))
    };
    if touch_just {
        launch = true;
    }
    // Touch steering = drag-to-position: the paddle chases the finger's horizontal
    // position (put your finger where you want the paddle and slide). Keyboard wins
    // if a key is held. This stays in the {-1,0,1} dir model, so the recorded trace
    // and headless replay are unchanged; only the live steering feel improves.
    if dir == 0 {
        if let Some(tx) = touch_x {
            let c = world.resource::<Cfg>().0;
            let win_w = {
                let mut wq = world.query_filtered::<&Window, With<PrimaryWindow>>();
                wq.single(&*world).ok().map(|w| w.width()).unwrap_or(0.0)
            };
            let paddle_x = {
                let mut pq = world.query_filtered::<&Pos, With<Paddle>>();
                pq.iter(&*world).next().map(|p| p.x)
            };
            if let (true, Some(px)) = (win_w > 0.0, paddle_x) {
                // map touch x across the window -> target paddle x in arena space.
                let f = (tx / win_w).clamp(0.0, 1.0);
                let target = (f * c.arena_w as f32 * FP as f32) as i32;
                // dead zone = one paddle step, so it settles under the finger instead
                // of oscillating by +/- a step around the target.
                let dead = c.paddle_speed;
                if target - px > dead {
                    dir = 1;
                } else if px - target > dead {
                    dir = -1;
                }
            }
        }
    }
    (dir, launch)
}

fn record(world: &mut World, dir: i32, launch: bool) {
    let tick = world.resource::<Status>().tick;
    let mut rec = world.resource_mut::<Recorder>();
    if !rec.started || dir != rec.prev_dir || launch {
        rec.started = true;
        rec.prev_dir = dir;
        // Shared codec: headless replay decodes with the same module, so the wire
        // format cannot drift between record + replay.
        crate::codec::write_record(&mut rec.bytes, tick, dir, launch);
    }
}

fn snapshot(world: &mut World) -> Snap {
    let st = *world.resource::<Status>();
    let level = world.resource::<Level>().0;
    let c = world.resource::<Cfg>().0;
    let mut q = world.query::<(&Pos, &Ball)>();
    let (vy, stuck, bx, by) = q
        .iter(&*world)
        .next()
        .map(|(p, b)| {
            let px = to_px(p, &c);
            (b.vy, b.stuck, px.x, px.y)
        })
        .unwrap_or((0, true, 0.0, 0.0));
    Snap { bricks: st.bricks_left, level, lives: st.lives, vy, stuck, bx, by }
}

fn drive(world: &mut World) {
    if world.resource::<Recorder>().finished {
        return;
    }
    let dt = world.resource::<Time>().delta_secs().min(0.1);
    let (dir, launch_edge) = read_input(world);
    if launch_edge {
        world.resource_mut::<LaunchLatch>().0 = true;
    }
    world.resource_mut::<Accum>().0 += dt;

    let before = snapshot(world);
    let mut steps = 0;
    while world.resource::<Accum>().0 >= STEP && steps < MAX_STEPS_PER_FRAME {
        // Consume the latched launch on the first sub-step that runs; clears so the
        // ball launches exactly once. If no sub-step runs this frame the latch
        // survives to the next, so the press is never silently dropped.
        let launch = world.resource::<LaunchLatch>().0;
        if launch {
            world.resource_mut::<LaunchLatch>().0 = false;
        }
        {
            let mut pi = world.resource_mut::<PendingInput>();
            pi.dir = dir;
            pi.launch = launch;
        }
        record(world, dir, launch);
        world.resource_scope::<TickSched, _>(|w, mut sched| sched.0.run(w));
        world.resource_mut::<Accum>().0 -= STEP;
        steps += 1;
        if world.resource::<Status>().phase != Phase::Playing {
            break;
        }
    }
    let after = snapshot(world);
    emit_feedback(world, &before, &after);

    let st = *world.resource::<Status>();
    if st.phase != Phase::Playing && !world.resource::<Recorder>().finished {
        world.resource_mut::<Recorder>().finished = true;
        emit_sfx(if st.phase == Phase::Won { "win" } else { "lose" });
        let bytes = world.resource::<Recorder>().bytes.clone();
        dispatch_finish(st.phase == Phase::Won, &bytes);
    }
}

fn emit_feedback(world: &mut World, b: &Snap, a: &Snap) {
    if !a.stuck && b.stuck {
        emit_sfx("launch");
    }
    if a.bricks < b.bricks {
        emit_sfx("break");
        if world.resource::<Is3d>().0 {
            // floor z = -(2D px y), since to_px flips the vertical axis.
            spawn_debris_3d(world, a.bx, -a.by);
        } else {
            spawn_particles(world, a.bx, a.by);
        }
    }
    if a.level > b.level {
        emit_sfx("level");
    }
    if a.lives < b.lives {
        emit_sfx("lose");
    }
    if !a.stuck && b.vy > 0 && a.vy < 0 {
        emit_sfx("bounce");
    }
}

fn spawn_particles(world: &mut World, x: f32, y: f32) {
    let accent = world.resource::<Palette>().accent;
    world.resource_scope::<RenderRng, _>(|w, mut rng| {
        for _ in 0..8 {
            let ang = rng.frange(0.0, std::f32::consts::TAU);
            let spd = rng.frange(50.0, 180.0);
            let sz = rng.frange(3.0, 6.0);
            w.spawn((
                Sprite { color: accent, custom_size: Some(Vec2::splat(sz)), ..default() },
                Transform::from_xyz(x, y, 6.0),
                Particle { vx: ang.cos() * spd, vy: ang.sin() * spd, life: 0.0, max: rng.frange(0.25, 0.5) },
            ));
        }
    });
}

/// 3D brick-break burst: a handful of glowing cubes thrown out from the impact,
/// pulled down by gravity, tumbling and shrinking before they despawn.
fn spawn_debris_3d(world: &mut World, x: f32, z: f32) {
    let art = world.resource::<DebrisArt>().clone();
    world.resource_scope::<RenderRng, _>(|w, mut rng| {
        for _ in 0..10 {
            let ang = rng.frange(0.0, std::f32::consts::TAU);
            let spd = rng.frange(40.0, 110.0);
            let up = rng.frange(70.0, 150.0);
            w.spawn((
                Mesh3d(art.mesh.clone()),
                MeshMaterial3d(art.mat.clone()),
                Transform::from_xyz(x, BRICK_H3 * 0.5, z),
                Debris {
                    vel: Vec3::new(ang.cos() * spd, up, ang.sin() * spd),
                    spin: Vec3::new(rng.frange(-8.0, 8.0), rng.frange(-8.0, 8.0), rng.frange(-8.0, 8.0)),
                    life: 0.0,
                    max: rng.frange(0.35, 0.6),
                },
            ));
        }
    });
}

fn update_debris_3d(
    time: Res<Time>,
    mut commands: Commands,
    mut q: Query<(Entity, &mut Transform, &mut Debris)>,
) {
    let dt = time.delta_secs();
    for (e, mut t, mut d) in &mut q {
        d.life += dt;
        if d.life >= d.max {
            commands.entity(e).despawn();
            continue;
        }
        d.vel.y -= 320.0 * dt; // gravity
        let v = d.vel;
        t.translation += v * dt;
        let spin = d.spin * dt;
        t.rotate(Quat::from_euler(EulerRot::XYZ, spin.x, spin.y, spin.z));
        let f = (1.0 - d.life / d.max).clamp(0.0, 1.0);
        t.scale = Vec3::splat(f);
    }
}

/// Keep the flat 2D star backdrop covering the viewport as the iframe resizes.
fn fit_star_bg(
    windows: Query<&Window, With<PrimaryWindow>>,
    mut q: Query<&mut Sprite, With<StarBg>>,
) {
    let Ok(win) = windows.single() else { return };
    for mut sp in &mut q {
        sp.custom_size = Some(Vec2::new(win.width(), win.height()));
    }
}

fn emit_sfx(name: &str) {
    let Some(window) = web_sys::window() else { return };
    let detail = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&detail, &JsValue::from_str("name"), &JsValue::from_str(name));
    let init = web_sys::CustomEventInit::new();
    init.set_detail(&detail);
    init.set_bubbles(false);
    if let Ok(ev) = web_sys::CustomEvent::new_with_event_init_dict("wallsmash:sfx", &init) {
        let _ = window.dispatch_event(&ev);
    }
}

fn dispatch_finish(passed: bool, bytes: &[u8]) {
    let Some(window) = web_sys::window() else { return };
    let detail = js_sys::Object::new();
    let arr = js_sys::Uint8Array::from(bytes);
    let _ = js_sys::Reflect::set(&detail, &JsValue::from_str("passed"), &JsValue::from_bool(passed));
    let _ = js_sys::Reflect::set(&detail, &JsValue::from_str("trace"), &arr);
    let init = web_sys::CustomEventInit::new();
    init.set_detail(&detail);
    init.set_bubbles(false);
    if let Ok(ev) = web_sys::CustomEvent::new_with_event_init_dict("wallsmash:finish", &init) {
        let _ = window.dispatch_event(&ev);
    }
}
