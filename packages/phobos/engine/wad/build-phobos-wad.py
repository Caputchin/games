#!/usr/bin/env python3
"""Assemble a Phobos IWAD from FreeDoom (BSD): one small arena map replacing all
36 maps, music stripped (except the slot's track), and the big unused asset
groups trimmed. Starts from full freedoom1.wad so all engine-required lumps
exist; we remove only what our texture/flat set doesn't reference. Patch loading
is lazy + CheckNumForName-based, so deleting unreferenced patch lumps while
keeping TEXTURE1/PNAMES intact is safe (R_PrecacheLevel only touches the
textures our map uses). The arena ships monster-free; every demon is spawned
procedurally from the server seed at level init (phobos.c).

Sprites/sounds/graphics are kept whole for now (engine's sprnames[] table
requires a lump for every sprite; trimming those needs an info.c edit - a later
optimization). The dominant win is the 9.6MB patch group."""
import os
import struct
from omg import WAD
from omg.mapedit import MapEditor, Vertex, Sidedef, Linedef, Sector, Thing

# Source IWAD: the upstream Freedoom phase-1 WAD (a dev build input, not vendored).
# Point FREEDOOM_WAD at your local copy; see the package README.
SRC = os.environ.get('FREEDOOM_WAD', 'freedoom1.wad')
OUT = 'phobos-min.wad'

# --- Texture/flat palette the campaign uses (cohesive tech-base look) ---
TEXTURES = ['STARGR1', 'STARGR2', 'METAL', 'BROWN1', 'COMPUTE1', 'STEP3',
            'DOOR1', 'SW1BRN1', 'SUPPORT3', 'BIGDOOR2', 'SKY1']  # SKY1 = E1 sky (engine-required)
FLATS_KEEP = {'FLOOR0_3', 'FLOOR0_5', 'CEIL5_1', 'FLAT1', 'FLAT5_4',
              'F_SKY1', 'FLOOR4_8', 'CEIL3_1'}  # static flats only (no anim starts)
KEEP_MUSIC = {'D_E1M1', 'D_E1M2', 'D_E1M3', 'D_E1M4'}  # one per campaign map (engine hard-looks-up D_<map>)

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
    the inner sector). The riser/face shows on the main-side lower texture."""
    x0, y0, x1, y1 = box
    pv = len(ed.vertexes)
    ed.vertexes += [Vertex(x0, y0), Vertex(x1, y0), Vertex(x1, y1), Vertex(x0, y1)]
    for (a, b) in [(pv + 0, pv + 1), (pv + 1, pv + 2), (pv + 2, pv + 3), (pv + 3, pv + 0)]:
        front = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', riser_tex, '-', 0))
        back = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', '-', '-', inner_sector))
        ld = Linedef(a, b, 0, 0, 0, front, back)
        ld.two_sided = True
        ed.linedefs.append(ld)


def build_map(outer_pts, walls, feature):
    """A DOOM arena: a convex outer room + one central feature. Ships with only
    the player start; demons spawn from the per-round seed (phobos.c)."""
    ed = MapEditor()
    ed.sectors.append(Sector(0, 168, FLOOR, CEIL, 150, 0, 0))   # sector 0 = main floor
    _outer_walls(ed, outer_pts, walls)
    cx0, cy0, cx1, cy1 = PLAT

    if feature == 'platform':       # raised step-up island, brighter
        ed.sectors.append(Sector(24, 168, 'FLOOR0_5', 'CEIL3_1', 210, 0, 0))
        _inner_box(ed, PLAT, len(ed.sectors) - 1, 'STEP3')
    elif feature == 'pit':          # sunken nukage-floor pit, dimmer
        ed.sectors.append(Sector(-24, 168, 'FLAT5_4', CEIL, 120, 0, 0))
        _inner_box(ed, PLAT, len(ed.sectors) - 1, 'STEP3')
    elif feature == 'pillars':      # four solid floor-to-ceiling columns
        sz = 112
        for (px, py) in [(cx0, cy0), (cx1 - sz, cy0), (cx0, cy1 - sz), (cx1 - sz, cy1 - sz)]:
            ed.sectors.append(Sector(168, 168, FLOOR, CEIL, 150, 0, 0))  # floor==ceil = solid
            _inner_box(ed, (px, py, px + sz, py + sz), len(ed.sectors) - 1, 'SUPPORT3')

    th = Thing(AW // 2, 200, 90, 1, 0)
    th.easy = th.medium = th.hard = True
    ed.things = [th]
    return ed


# The campaign arenas: distinct outer shape + central feature, all reusing the
# same texture/sprite/sound palette. start_level (config) picks the captcha map;
# the live game cycles through the rest as bonus levels.
CAMPAIGN = [
    (octagon_pts(), ['METAL', 'BROWN1', 'STARGR1', 'COMPUTE1', 'METAL', 'BROWN1', 'STARGR1', 'SUPPORT3'], 'platform'),
    (rect_pts(),    ['BROWN1', 'SUPPORT3', 'DOOR1', 'BROWN1'], 'pit'),
    (octagon_pts(288), ['STARGR1', 'METAL', 'COMPUTE1', 'STARGR2', 'STARGR1', 'METAL', 'COMPUTE1', 'STARGR2'], 'pillars'),
    (rect_pts(),    ['COMPUTE1', 'METAL', 'STARGR2', 'METAL'], 'platform'),
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
for name in list(w.maps):
    del w.maps[name]
for i, (pts, walls, feature) in enumerate(CAMPAIGN, 1):
    w.maps['E1M%d' % i] = build_map(pts, walls, feature).to_lumps()
w.to_file(OUT)

after = sum(len(l.data) for g in (w.patches, w.flats, w.sprites, w.sounds,
            w.graphics, w.music, w.data) for l in g.values())
print('asset bytes: %.2f MB -> %.2f MB' % (before / 1e6, after / 1e6))
print('wrote', OUT)
