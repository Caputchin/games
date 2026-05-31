#!/usr/bin/env python3
"""Assemble a Phobos IWAD from FreeDoom (BSD): one small arena map replacing all
36 maps, music stripped (except the slot's track), and the big unused asset
groups trimmed. Starts from full freedoom1.wad so all engine-required lumps
exist; we remove only what our texture/flat set doesn't reference. Patch loading
is lazy + CheckNumForName-based, so deleting unreferenced patch lumps while
keeping TEXTURE1/PNAMES intact is safe (R_PrecacheLevel only touches the
textures our map uses). The arena ships monster-free; every demon is spawned
procedurally from the server seed at level init (phobos.c).

Sprites are trimmed to KEEP_SPRITES -- only the ones the game can actually spawn.
R_InitSpriteDefs already tolerates a sprite name with no lumps (numframes=0, no
error), and the stripped sprites are never spawned, so the live build renders
fine and no info.c edit is needed. This is the dominant size lever: it lets ONE
shared WAD fit the replay artifact's per-artifact size cap, so the live build and
the headless replay embed the same WAD (no duplicate). Sounds/graphics are kept
whole (the live build plays sounds; both builds boot the HUD/status graphics)."""
import os
import random
import struct
from omg import WAD
from omg.mapedit import MapEditor, Vertex, Sidedef, Linedef, Sector, Thing

# Custom doomednum the engine intercepts (p_mobj.c) as a seeded-wave spawn point.
# Placed in every map's walkable floor; phobos.c picks a seeded subset per round.
SPAWN_DM = 4001

# Source IWAD: the upstream Freedoom phase-1 WAD (a dev build input, not vendored).
# Point FREEDOOM_WAD at your local copy; see the package README.
SRC = os.environ.get('FREEDOOM_WAD', 'freedoom1.wad')
OUT = 'phobos-min.wad'

# --- Texture/flat palette the campaign uses (cohesive tech-base look) ---
TEXTURES = ['STARGR1', 'STARGR2', 'METAL', 'BROWN1', 'COMPUTE1', 'STEP3',
            'DOOR1', 'SW1BRN1', 'SUPPORT3', 'BIGDOOR2', 'SKY1']  # SKY1 = E1 sky (engine-required)
FLATS_KEEP = {'FLOOR0_3', 'FLOOR0_5', 'CEIL5_1', 'FLAT1', 'FLAT5_4',
              'F_SKY1', 'FLOOR4_8', 'CEIL3_1'}  # static flats only (no anim starts)
KEEP_MUSIC = {'D_E1M1', 'D_E1M2', 'D_E1M3', 'D_E1M4',
              'D_E1M5', 'D_E1M6'}  # one per campaign map (engine hard-looks-up D_<map>)

# Sprites the game can actually spawn -- the ONLY ones the live build ever
# renders, so every other DOOM sprite (other monsters, unowned weapons, pickups,
# decorations) is dead weight and stripped. This is the dominant size lever and
# lets ONE shared WAD fit the replay artifact's per-artifact cap (so live + the
# headless replay embed the same WAD; no duplicate). R_InitSpriteDefs already
# tolerates a name with no lumps (numframes=0, no error), and the stripped ones
# are never spawned -> never rendered, so live is unaffected.
#   PLAY=player+corpse  POSS/TROO/SARG=zombieman/imp/pinky  BAL1=imp fireball
#   PUFF/BLUD=hit effects  CLIP=zombieman death drop  TFOG=nightmare respawn fog
#   PUNG/PISG/PISF/SHTG/SHTF=fist/pistol/shotgun (the only owned weapons + flashes)
KEEP_SPRITES = {'PLAY', 'POSS', 'TROO', 'SARG', 'BAL1', 'PUFF', 'BLUD', 'CLIP',
                'TFOG', 'PUNG', 'PISG', 'PISF', 'SHTG', 'SHTF'}

# Arena bounding box. The seeded monster spawn in phobos.c uses the same bounds
# (keep them in sync). Player starts bottom-center; a raised platform sits in the
# middle. Octagonal footprint (cut-corner square) reads far more "DOOM" than a box.
AW, AH = 1536, 1280
PLAT = (576, 448, 960, 832)   # raised central platform (x0,y0,x1,y1)
WALL, FLOOR, CEIL = 'METAL', 'FLOOR0_3', 'CEIL5_1'


def parse_pnames(data):
    n = struct.unpack_from('<i', data, 0)[0]
    return [data[4 + i * 8:12 + i * 8].split(b'\0')[0].decode('ascii', 'ignore').upper()
            for i in range(n)]


def parse_textures(tex1, pnames):
    """name -> (masked,w,h,coldir,[(ox,oy,patchname,stepdir,colormap)...])."""
    out = {}
    ntex = struct.unpack_from('<i', tex1, 0)[0]
    offs = struct.unpack_from('<%di' % ntex, tex1, 4)
    for off in offs:
        name = tex1[off:off + 8].split(b'\0')[0].decode('ascii', 'ignore').upper()
        masked, width, height, coldir, pc = struct.unpack_from('<ihhih', tex1, off + 8)
        pats = []
        for i in range(pc):
            ox, oy, pidx, sd, cm = struct.unpack_from('<hhhhh', tex1, off + 22 + i * 10)
            pn = pnames[pidx] if 0 <= pidx < len(pnames) else '?'
            pats.append((ox, oy, pn, sd, cm))
        out[name] = (masked, width, height, coldir, pats)
    return out


def build_texture_lumps(texdefs, wanted):
    """Rebuild TEXTURE1 + PNAMES containing only `wanted` (order preserved,
    AASTINKY placeholder forced to index 0). Returns (tex1_bytes, pnames_bytes)."""
    keep = ['AASTINKY'] + [t.upper() for t in wanted if t.upper() != 'AASTINKY']
    keep = [t for t in keep if t in texdefs]
    # collect referenced patches
    pn_list, pn_idx = [], {}
    for tn in keep:
        for (_, _, pname, _, _) in texdefs[tn][4]:
            if pname not in pn_idx:
                pn_idx[pname] = len(pn_list); pn_list.append(pname)
    pnames = struct.pack('<i', len(pn_list)) + b''.join(
        p.encode('ascii').ljust(8, b'\0')[:8] for p in pn_list)
    # serialize each texture, compute offsets
    bodies, offsets = [], []
    header = 4 + 4 * len(keep)
    cur = header
    for tn in keep:
        masked, width, height, coldir, pats = texdefs[tn]
        b = tn.encode('ascii').ljust(8, b'\0')[:8]
        b += struct.pack('<ihhih', masked, width, height, coldir, len(pats))
        for (ox, oy, pname, sd, cm) in pats:
            b += struct.pack('<hhhhh', ox, oy, pn_idx[pname], sd, cm)
        offsets.append(cur); cur += len(b); bodies.append(b)
    tex1 = struct.pack('<i', len(keep)) + struct.pack('<%di' % len(keep), *offsets) + b''.join(bodies)
    return tex1, pnames, set(pn_list)


# Outer-shape vertex rings (CCW so each one-sided wall's front faces the
# interior). All contain the seeded-spawn rectangle (~300..1236 x 300..980) and
# the central feature box (PLAT), so the same seeded spawn (phobos.c) is valid
# on every map.
def rect_pts():
    return [(0, 0), (0, AH), (AW, AH), (AW, 0)]


def octagon_pts(c=384):
    return [(0, c), (0, AH - c), (c, AH), (AW - c, AH),
            (AW, AH - c), (AW, c), (AW - c, 0), (c, 0)]


def _outer_walls(ed, pts, walls):
    base = len(ed.vertexes)
    for (x, y) in pts:
        ed.vertexes.append(Vertex(x, y))
    n = len(pts)
    for i in range(n):
        sd = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', '-', walls[i % len(walls)], 0))
        ld = Linedef(base + i, base + (i + 1) % n, 0, 0, 0, sd, -1)
        ld.impassable = True
        ed.linedefs.append(ld)


def _inner_box(ed, box, inner_sector, riser_tex):
    """4 two-sided lines around an inner sector (front = main sector 0, back =
    the inner sector). The riser texture is set on BOTH sides' lower so the wall
    is drawn whether viewed from the main floor OR from inside a sunken pit / atop
    a raised step -- a one-sided texturing leaves the inner-facing wall untextured
    and it renders as HOM the moment the player is inside the feature."""
    x0, y0, x1, y1 = box
    pv = len(ed.vertexes)
    ed.vertexes += [Vertex(x0, y0), Vertex(x1, y0), Vertex(x1, y1), Vertex(x0, y1)]
    for (a, b) in [(pv + 0, pv + 1), (pv + 1, pv + 2), (pv + 2, pv + 3), (pv + 3, pv + 0)]:
        front = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', riser_tex, '-', 0))
        back = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', riser_tex, '-', inner_sector))
        ld = Linedef(a, b, 0, 0, 0, front, back)
        ld.two_sided = True
        ed.linedefs.append(ld)


def _arena_marker_things(exclude_boxes):
    """Seeded-wave spawn markers (doomednum 4001) on the MAIN arena floor, clear
    of the player start and of every feature box (holes, raised steps, solid
    pillars) so demons never spawn stuck below/above the player or inside solid
    geometry -- they always land on traversable floor and can approach. A dense
    7x6 grid (42 cells) leaves >= the max wave (16) distinct points even after the
    feature exclusions; the first 16 are used."""
    pts = []
    for x in range(380, 1161, 130):      # 7 columns across the spawn band
        for y in range(360, 941, 115):   # 6 rows
            if any(bx0 - 48 < x < bx1 + 48 and by0 - 48 < y < by1 + 48
                   for (bx0, by0, bx1, by1) in exclude_boxes):
                continue                 # over a feature (hole / step / pillar)
            if abs(x - AW // 2) < 140 and abs(y - 200) < 140:
                continue                 # too close to the player start
            pts.append((x, y))
    things = []
    for (x, y) in pts[:16]:
        m = Thing(x, y, 0, SPAWN_DM, 0)
        m.easy = m.medium = m.hard = True
        things.append(m)
    return things


def build_map(outer_pts, walls, feature):
    """A DOOM arena: a convex outer room + one central feature. Ships with only
    the player start + seeded-wave spawn markers; demons spawn from the per-round
    seed (phobos.c)."""
    ed = MapEditor()
    ed.sectors.append(Sector(0, 168, FLOOR, CEIL, 150, 0, 0))   # sector 0 = main floor
    _outer_walls(ed, outer_pts, walls)
    cx0, cy0, cx1, cy1 = PLAT
    boxes = []                      # feature footprints, kept clear of spawn markers

    if feature == 'platform':       # raised step-up island, brighter
        ed.sectors.append(Sector(24, 168, 'FLOOR0_5', 'CEIL3_1', 210, 0, 0))
        _inner_box(ed, PLAT, len(ed.sectors) - 1, 'STEP3')
        boxes = [PLAT]
    elif feature == 'pit':          # single sunken nukage-floor pit, dimmer
        ed.sectors.append(Sector(-24, 168, 'FLAT5_4', CEIL, 120, 0, 0))
        _inner_box(ed, PLAT, len(ed.sectors) - 1, 'STEP3')
        boxes = [PLAT]
    elif feature == 'pillars':      # four solid floor-to-ceiling columns
        sz = 112
        for (px, py) in [(cx0, cy0), (cx1 - sz, cy0), (cx0, cy1 - sz), (cx1 - sz, cy1 - sz)]:
            ed.sectors.append(Sector(168, 168, FLOOR, CEIL, 150, 0, 0))  # floor==ceil = solid
            _inner_box(ed, (px, py, px + sz, py + sz), len(ed.sectors) - 1, 'SUPPORT3')
            boxes.append((px, py, px + sz, py + sz))
    elif feature == 'holes':        # simple arena, several sunken nukage holes in the corners
        # Depth -24 == DOOM's max step-up, so a player who walks into a hole can
        # still climb out (a deeper pit traps them and breaks the round).
        for box in [(300, 300, 520, 520), (1016, 300, 1236, 520),
                    (300, 760, 520, 980), (1016, 760, 1236, 980)]:
            ed.sectors.append(Sector(-24, 168, 'FLAT5_4', CEIL, 110, 0, 0))
            _inner_box(ed, box, len(ed.sectors) - 1, 'STEP3')
            boxes.append(box)

    th = Thing(AW // 2, 200, 90, 1, 0)
    th.easy = th.medium = th.hard = True
    ed.things = [th] + _arena_marker_things(boxes)
    return ed


def _gen_maze(cols, rows, rng):
    """Perfect maze (recursive backtracker) over a cols x rows cell grid. Returns
    the set of frozenset({cellA, cellB}) passages between connected cells."""
    passages = set()
    visited = {(0, 0)}
    stack = [(0, 0)]
    while stack:
        cx, cy = stack[-1]
        nbrs = [(cx + dx, cy + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= cx + dx < cols and 0 <= cy + dy < rows and (cx + dx, cy + dy) not in visited]
        if not nbrs:
            stack.pop()
            continue
        nxt = nbrs[rng.randrange(len(nbrs))]
        passages.add(frozenset({(cx, cy), nxt}))
        visited.add(nxt)
        stack.append(nxt)
    return passages


def build_maze(cols, rows, pitch, hw, wall_tex, seed):
    """A genuine corridor maze: one walkable floor sector bounded by one-sided
    walls. A room sits at each cell centre and a (2*hw)-wide corridor joins every
    connected pair; the void between unconnected cells IS the wall. Player start
    at cell (0,0) plus 16 seeded-wave markers spread over the other cells.

    Geometry is fixed at build time from its OWN rng `seed` (not the server seed),
    so the WAD is reproducible and the map is replay-safe. The walkable region is
    rasterised at hw resolution and its floor/void boundary edges are emitted as
    one-sided linedefs oriented with the floor sector on the right of v1->v2."""
    rng = random.Random(seed)
    passages = _gen_maze(cols, rows, rng)
    R = hw                                   # raster cell == corridor half-width
    gw, gh = cols * pitch // R, rows * pitch // R
    floor = [[False] * gh for _ in range(gw)]

    def fill(x0, y0, x1, y1):
        for gx in range(max(0, x0 // R), min(gw, (x1 + R - 1) // R)):
            for gy in range(max(0, y0 // R), min(gh, (y1 + R - 1) // R)):
                floor[gx][gy] = True

    centers = {}
    for cx in range(cols):
        for cy in range(rows):
            mx, my = cx * pitch + pitch // 2, cy * pitch + pitch // 2
            centers[(cx, cy)] = (mx, my)
            fill(mx - hw, my - hw, mx + hw, my + hw)            # room
    for pr in passages:
        (ax, ay), (bx, by) = (centers[c] for c in pr)
        fill(min(ax, bx) - hw, min(ay, by) - hw,
             max(ax, bx) + hw, max(ay, by) + hw)               # corridor

    ed = MapEditor()
    ed.sectors.append(Sector(0, 168, FLOOR, CEIL, 150, 0, 0))
    vert = {}

    def vid(x, y):
        k = (x, y)
        if k not in vert:
            vert[k] = len(ed.vertexes)
            ed.vertexes.append(Vertex(x, y))
        return vert[k]

    def wall(x1, y1, x2, y2):
        sd = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', '-', wall_tex, 0))
        ld = Linedef(vid(x1, y1), vid(x2, y2), 0, 0, 0, sd, -1)
        ld.impassable = True
        ed.linedefs.append(ld)

    for gx in range(gw):
        for gy in range(gh):
            if not floor[gx][gy]:
                continue
            x0, y0, x1, y1 = gx * R, gy * R, (gx + 1) * R, (gy + 1) * R
            if gx + 1 >= gw or not floor[gx + 1][gy]: wall(x1, y1, x1, y0)  # right edge
            if gx - 1 < 0 or not floor[gx - 1][gy]:   wall(x0, y0, x0, y1)  # left edge
            if gy + 1 >= gh or not floor[gx][gy + 1]: wall(x0, y1, x1, y1)  # top edge
            if gy - 1 < 0 or not floor[gx][gy - 1]:   wall(x1, y0, x0, y0)  # bottom edge

    sx, sy = centers[(0, 0)]
    th = Thing(sx, sy, 90, 1, 0)
    th.easy = th.medium = th.hard = True
    things = [th]
    cells = [c for c in centers if c != (0, 0)]
    rng.shuffle(cells)
    for c in cells[:16]:
        mx, my = centers[c]
        m = Thing(mx, my, 0, SPAWN_DM, 0)
        m.easy = m.medium = m.hard = True
        things.append(m)
    ed.things = things
    return ed


# The campaign maps, all reusing the same texture/sprite/sound palette.
# start_level (config, max 4) picks the captcha arena; the live game cycles
# through the rest as bonus levels. Levels 1-4 are open arenas (the captcha pool,
# kept cheap for the replay cpuMs budget); levels 5-6 are corridor mazes that
# feel genuinely different (bonus-only, never the replayed captcha). Each entry
# is a thunk so arenas and mazes can share one assembly loop.
CAMPAIGN = [
    lambda: build_map(octagon_pts(), ['METAL', 'BROWN1', 'STARGR1', 'COMPUTE1', 'METAL', 'BROWN1', 'STARGR1', 'SUPPORT3'], 'platform'),
    lambda: build_map(rect_pts(),    ['BROWN1', 'SUPPORT3', 'DOOR1', 'BROWN1'], 'holes'),
    lambda: build_map(octagon_pts(288), ['STARGR1', 'METAL', 'COMPUTE1', 'STARGR2', 'STARGR1', 'METAL', 'COMPUTE1', 'STARGR2'], 'pillars'),
    lambda: build_map(rect_pts(),    ['COMPUTE1', 'METAL', 'STARGR2', 'METAL'], 'platform'),
    lambda: build_maze(5, 4, 384, 96, 'BROWN1', 1337),
    lambda: build_maze(6, 4, 384, 96, 'STARGR1', 2024),
]


w = WAD(SRC)
pnames = parse_pnames(bytes(w.txdefs['PNAMES'].data))
texdefs = parse_textures(bytes(w.txdefs['TEXTURE1'].data), pnames)
if 'TEXTURE2' in w.txdefs:
    texdefs.update(parse_textures(bytes(w.txdefs['TEXTURE2'].data), pnames))
tex1, new_pnames, keep_patches = build_texture_lumps(texdefs, TEXTURES)
# Rebuild TEXTURE1/PNAMES to only our set; drop TEXTURE2 (its patches are gone).
from omg import Lump
w.txdefs['TEXTURE1'] = Lump(tex1)
w.txdefs['PNAMES'] = Lump(new_pnames)
if 'TEXTURE2' in w.txdefs:
    del w.txdefs['TEXTURE2']
print('textures kept:', '-> patches kept:', len(keep_patches))

before = sum(len(l.data) for g in (w.patches, w.flats, w.sprites, w.sounds,
             w.graphics, w.music, w.data) for l in g.values())

for name in list(w.patches):
    if name.upper() not in keep_patches:
        del w.patches[name]
for name in list(w.flats):
    if name.upper() not in FLATS_KEEP:
        del w.flats[name]
for name in list(w.music):
    if name.upper() not in KEEP_MUSIC:
        del w.music[name]
for name in list(w.sprites):
    if name[:4].upper() not in KEEP_SPRITES:
        del w.sprites[name]
for name in list(w.maps):
    del w.maps[name]
for i, builder in enumerate(CAMPAIGN, 1):
    w.maps['E1M%d' % i] = builder().to_lumps()
w.to_file(OUT)

after = sum(len(l.data) for g in (w.patches, w.flats, w.sprites, w.sounds,
            w.graphics, w.music, w.data) for l in g.values())
print('asset bytes: %.2f MB -> %.2f MB' % (before / 1e6, after / 1e6))
print('wrote', OUT)
