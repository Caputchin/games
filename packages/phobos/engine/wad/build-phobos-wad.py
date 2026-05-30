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
KEEP_MUSIC = {'D_E1M1'}

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


def build_arena():
    """An octagonal DOOM arena: varied wall textures, a moody main floor, and a
    brighter raised central platform (a step-up island). Ships with only the
    player start; the demon wave is spawned from the per-round seed (phobos.c)."""
    ed = MapEditor()
    cx0, cy0, cx1, cy1 = PLAT

    # Octagon outer boundary (cut-corner square), CCW so the front sidedef faces
    # the interior (same winding the box used). Cut = 384 corner inset.
    c = 384
    oct_pts = [(0, c), (0, AH - c), (c, AH), (AW - c, AH), (AW, AH - c),
               (AW, c), (AW - c, 0), (c, 0)]
    base = len(ed.vertexes)
    for (x, y) in oct_pts:
        ed.vertexes.append(Vertex(x, y))

    # Sector 0 = main floor (moody), sector 1 = raised platform (brighter).
    ed.sectors.append(Sector(0, 168, FLOOR, CEIL, 150, 0, 0))      # main
    ed.sectors.append(Sector(24, 168, 'FLOOR0_5', 'CEIL3_1', 210, 0, 0))  # platform

    # Varied wall textures around the octagon for a built environment.
    walls = ['METAL', 'BROWN1', 'STARGR1', 'COMPUTE1', 'METAL', 'BROWN1',
             'STARGR1', 'SUPPORT3']
    for i in range(8):
        sd = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', '-', walls[i], 0))
        a, b = base + i, base + (i + 1) % 8
        ld = Linedef(a, b, 0, 0, 0, sd, -1)
        ld.impassable = True
        ed.linedefs.append(ld)

    # Raised central platform: 4 two-sided lines (front = main sector 0, back =
    # platform sector 1). Walk CW so the outside (main) is on the right/front;
    # the step riser shows STEP3 on the front lower texture.
    pv = base + 8
    ed.vertexes += [Vertex(cx0, cy0), Vertex(cx1, cy0), Vertex(cx1, cy1), Vertex(cx0, cy1)]
    plat_loop = [(pv + 0, pv + 1), (pv + 1, pv + 2), (pv + 2, pv + 3), (pv + 3, pv + 0)]
    for (a, b) in plat_loop:
        front = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', 'STEP3', '-', 0))   # main side, riser
        back = len(ed.sidedefs)
        ed.sidedefs.append(Sidedef(0, 0, '-', '-', '-', 1))       # platform side
        ld = Linedef(a, b, 0, 0, 0, front, back)
        ld.two_sided = True
        ed.linedefs.append(ld)

    def th(x, y, t, ang=90):
        o = Thing(x, y, ang, t, 0); o.easy = o.medium = o.hard = True; return o
    # ONLY the player start: the arena ships monster-free. Every demon is spawned
    # from the per-round server seed (phobos_spawn_wave), so the entire start
    # state is unpredictable and a pre-recorded input demo can't be replayed.
    ed.things = [th(AW // 2, 200, 1, 90)]
    return ed


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
w.maps['E1M1'] = build_arena().to_lumps()
w.to_file(OUT)

after = sum(len(l.data) for g in (w.patches, w.flats, w.sprites, w.sounds,
            w.graphics, w.music, w.data) for l in g.values())
print('asset bytes: %.2f MB -> %.2f MB' % (before / 1e6, after / 1e6))
print('wrote', OUT)
