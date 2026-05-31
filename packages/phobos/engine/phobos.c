// Phobos: seed-driven start state + deterministic ticcmd capture/replay.
// Shared by BOTH the live (PHOBOS_LIVE) and headless replay (PHOBOS_HEADLESS)
// builds, so the captcha round is reproducible: the same (seed, trace) yields
// the same monster layout and the same kill count live and on the server.
#include <string.h>
#include <stdlib.h>
#include <stdint.h>

#include "doomdef.h"
#include "doomstat.h"
#include "d_player.h"
#include "d_ticcmd.h"
#include "p_local.h"
#include "m_random.h"
#include "info.h"
#include "tables.h"

// ---- seeded PRNG (xorshift128) -------------------------------------------
// Independent of DOOM's 256-entry M_Random table: drives spawn layout, which
// needs more entropy than 256 start positions. Deterministic from the 128-bit
// server seed; identical in both builds.
static uint32_t pstate[4];
int phobos_have_seed = 0;
int phobos_seed_rndindex = 0;   // read by the patched M_ClearRandom
int phobos_seed_prndindex = 0;

// Server-owned difficulty, applied late: G_DoNewGame resets fastparm/respawnparm
// to false right before G_InitNew reads them, so setting the globals up front is
// clobbered. We stash them here and re-apply inside G_DoNewGame after the reset.
int phobos_fast = 0;
int phobos_respawn = 0;

void phobos_set_difficulty(int fast, int respawn)
{
    phobos_fast = fast ? 1 : 0;
    phobos_respawn = respawn ? 1 : 0;
}

void phobos_seed(uint32_t a, uint32_t b, uint32_t c, uint32_t d)
{
    pstate[0] = a ? a : 0x9e3779b9u;
    pstate[1] = b ? b : 0x85ebca6bu;
    pstate[2] = c ? c : 0xc2b2ae35u;
    pstate[3] = d ? d : 0x27d4eb2fu;
    phobos_have_seed = 1;
    phobos_seed_rndindex  = (int)((b ^ d) & 0xff);
    phobos_seed_prndindex = (int)((a ^ c) & 0xff);
}

static uint32_t phobos_rand(void)
{
    uint32_t t = pstate[3], w = pstate[0];
    pstate[3] = pstate[2]; pstate[2] = pstate[1]; pstate[1] = w;
    t ^= t << 11; t ^= t >> 8;
    pstate[0] = t ^ w ^ (w >> 19);
    return pstate[0];
}

// ---- seeded procedural monster spawn (anti-cheat start state) -------------
// Called from G_DoLoadLevel after P_SetupLevel. The maps ship monster-free; we
// place the wave from the seed so every round differs and pre-recorded input
// demos fail (the monsters aren't where the recording expects).
static int phobos_wave_count = 5;
static const mobjtype_t WAVE[] = { MT_POSSESSED, MT_TROOP, MT_SERGEANT };

void phobos_set_wave(int count) { if (count > 0) phobos_wave_count = count; }

// Spawn-point markers (doomednum 4001) authored into every map and collected at
// P_SetupLevel (the P_SpawnMapThing intercept calls phobos_add_spawnpt). The
// seeded wave lands at a seeded subset of these, so spawning is valid in ANY
// geometry -- open arenas AND tight mazes -- not just a hardcoded rectangle.
// Static WAD data => deterministic + replay-safe (the server rebuilds the same
// map). Coords are map units (mapthing_t space), shifted to fixed-point on spawn.
#define PHOBOS_MAX_SPAWNPTS 64
typedef struct { int x, y; } phobos_spawnpt_t;
static phobos_spawnpt_t phobos_spawnpts[PHOBOS_MAX_SPAWNPTS];
static int phobos_spawnpt_count = 0;

void phobos_reset_spawnpts(void) { phobos_spawnpt_count = 0; }

void phobos_add_spawnpt(int x, int y)
{
    if (phobos_spawnpt_count < PHOBOS_MAX_SPAWNPTS)
    {
        phobos_spawnpts[phobos_spawnpt_count].x = x;
        phobos_spawnpts[phobos_spawnpt_count].y = y;
        phobos_spawnpt_count++;
    }
}

static void phobos_arm_player(void)
{
    player_t *p = &players[consoleplayer];
    p->killcount = 0;                  // deterministic per-round kill baseline
    p->weaponowned[wp_shotgun] = true;
    p->ammo[am_shell] = p->maxammo[am_shell];
    p->ammo[am_clip] = p->maxammo[am_clip];
    p->pendingweapon = wp_shotgun;
}

void phobos_spawn_wave(void)
{
    if (!phobos_have_seed) return;
    phobos_arm_player();

    if (phobos_spawnpt_count > 0)
    {
        // Seeded Fisher-Yates over the authored points, take the first
        // wave_count (distinct while count <= points, wrapping only if the wave
        // exceeds the authored markers). Deterministic rand-call count.
        int idx[PHOBOS_MAX_SPAWNPTS];
        for (int i = 0; i < phobos_spawnpt_count; i++) idx[i] = i;
        for (int i = phobos_spawnpt_count - 1; i > 0; i--)
        {
            int j = (int)(phobos_rand() % (uint32_t)(i + 1));
            int t = idx[i]; idx[i] = idx[j]; idx[j] = t;
        }
        for (int i = 0; i < phobos_wave_count; i++)
        {
            phobos_spawnpt_t *sp = &phobos_spawnpts[idx[i % phobos_spawnpt_count]];
            mobjtype_t t = WAVE[phobos_rand() % (sizeof(WAVE) / sizeof(WAVE[0]))];
            mobj_t *m = P_SpawnMobj(sp->x << FRACBITS, sp->y << FRACBITS, ONFLOORZ, t);
            if (m) m->angle = (angle_t)phobos_rand() & (angle_t)0xE0000000u;
        }
        return;
    }

    // Fallback for a map with no authored markers: legacy hardcoded-bounds
    // rejection sampling against the original octagon arena + central platform.
    const int LOX = 300, HIX = 1536 - 300, LOY = 300, HIY = 1280 - 300;
    const int PX0 = 576, PY0 = 448, PX1 = 960, PY1 = 832;   // central platform
    mobj_t *pl = players[consoleplayer].mo;
    int px = pl ? (pl->x >> FRACBITS) : 768;
    int py = pl ? (pl->y >> FRACBITS) : 200;
    for (int i = 0; i < phobos_wave_count; i++)
    {
        int x, y, tries = 0;
        do {
            x = LOX + (int)(phobos_rand() % (uint32_t)(HIX - LOX));
            y = LOY + (int)(phobos_rand() % (uint32_t)(HIY - LOY));
            tries++;
        } while (((abs(x - px) < 140 && abs(y - py) < 140) ||
                  (x > PX0 - 48 && x < PX1 + 48 && y > PY0 - 48 && y < PY1 + 48))
                 && tries < 12);
        mobjtype_t t = WAVE[phobos_rand() % (sizeof(WAVE) / sizeof(WAVE[0]))];
        mobj_t *m = P_SpawnMobj(x << FRACBITS, y << FRACBITS, ONFLOORZ, t);
        if (m) m->angle = (angle_t)phobos_rand() & (angle_t)0xE0000000u;
    }
}

// ---- ticcmd capture / replay (raw 4 bytes/tic, no header, no marker) ------
#define PHOBOS_TRACE_MAX (256 * 1024)
static unsigned char tracebuf[PHOBOS_TRACE_MAX];
static int trace_len = 0;   // bytes written (record) / total (replay)
static int trace_pos = 0;   // read cursor (replay)
int phobos_recording = 0;
int phobos_replaying = 0;

void phobos_record_begin(void) { trace_len = 0; phobos_recording = 1; phobos_replaying = 0; }

void phobos_replay_begin(const unsigned char *bytes, int len)
{
    if (len > PHOBOS_TRACE_MAX) len = PHOBOS_TRACE_MAX;
    memcpy(tracebuf, bytes, len);
    trace_len = len; trace_pos = 0;
    phobos_replaying = 1; phobos_recording = 0;
}

// Encode then read BACK into cmd (vanilla demo trick) so the live sim runs the
// exact quantized command the trace stores => live result == replay result.
void phobos_write_cmd(ticcmd_t *cmd)
{
    if (trace_len + 4 > PHOBOS_TRACE_MAX) return;
    unsigned char *p = &tracebuf[trace_len];
    p[0] = cmd->forwardmove;
    p[1] = cmd->sidemove;
    p[2] = (cmd->angleturn + 128) >> 8;
    p[3] = cmd->buttons;
    trace_len += 4;
    cmd->forwardmove = (signed char)p[0];
    cmd->sidemove    = (signed char)p[1];
    cmd->angleturn   = ((unsigned char)p[2]) << 8;
    cmd->buttons     = p[3];
}

void phobos_read_cmd(ticcmd_t *cmd)
{
    if (trace_pos + 4 > trace_len) { memset(cmd, 0, sizeof(*cmd)); return; }
    cmd->forwardmove = (signed char)tracebuf[trace_pos++];
    cmd->sidemove    = (signed char)tracebuf[trace_pos++];
    cmd->angleturn   = ((unsigned char)tracebuf[trace_pos++]) << 8;
    cmd->buttons     = (unsigned char)tracebuf[trace_pos++];
}

const unsigned char *phobos_get_trace(int *len) { *len = trace_len; return tracebuf; }
int phobos_kills(void) { return players[consoleplayer].killcount; }
