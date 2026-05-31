// Phobos LIVE platform: drives the real DOOM engine to an HTML canvas inside the
// game iframe. No SDL -- input arrives from JS (phobos_key), the framebuffer is
// read by JS each frame (phobos_fb), and the same seeded spawn + ticcmd recording
// as the headless build runs here, so the captured trace replays byte-identically
// on the server. Compiled into dist/phobos.js (live IIFE), never the replay path.
#include <stdint.h>
#include <time.h>
#include <emscripten.h>
#include "doomgeneric.h"
#include "doomdef.h"
#include "doomstat.h"
#include "doomkeys.h"

extern int leveltime;
extern void phobos_set_difficulty(int fast, int respawn);   // applied in G_DoNewGame
extern void G_DeferedInitNew(skill_t skill, int episode, int map);
extern void phobos_seed(uint32_t, uint32_t, uint32_t, uint32_t);
extern void phobos_record_begin(void);
extern void phobos_set_wave(int);
extern const unsigned char *phobos_get_trace(int *len);
extern int phobos_kills(void);
extern int phobos_recording, phobos_replaying;

// ---- key queue (JS feeds, DG_GetKey drains; mirrors doomgeneric_sdl.c) ----
#define KEYQUEUE_SIZE 64
static unsigned short keyqueue[KEYQUEUE_SIZE];
static unsigned int kq_write = 0, kq_read = 0;

EMSCRIPTEN_KEEPALIVE
void phobos_key(int pressed, int doomKey)
{
    keyqueue[kq_write] = (unsigned short)(((pressed ? 1 : 0) << 8) | (doomKey & 0xff));
    kq_write = (kq_write + 1) % KEYQUEUE_SIZE;
}

void DG_Init(void) {}
void DG_DrawFrame(void) {}          // JS blits phobos_fb() after each tick
void DG_SleepMs(uint32_t ms) {}
void DG_SetWindowTitle(const char *title) {}

uint32_t DG_GetTicksMs(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

int DG_GetKey(int *pressed, unsigned char *doomKey)
{
    if (kq_read == kq_write) return 0;
    unsigned short v = keyqueue[kq_read];
    kq_read = (kq_read + 1) % KEYQUEUE_SIZE;
    *pressed = v >> 8;
    *doomKey = v & 0xff;
    return 1;
}

// ---- JS interface ----
EMSCRIPTEN_KEEPALIVE int phobos_fb(void)     { return (int)(intptr_t)DG_ScreenBuffer; }
EMSCRIPTEN_KEEPALIVE int phobos_width(void)  { return DOOMGENERIC_RESX; }
EMSCRIPTEN_KEEPALIVE int phobos_height(void) { return DOOMGENERIC_RESY; }
EMSCRIPTEN_KEEPALIVE int phobos_killcount(void) { return phobos_kills(); }
EMSCRIPTEN_KEEPALIVE int phobos_tracelen(void)  { int n; phobos_get_trace(&n); return n; }
EMSCRIPTEN_KEEPALIVE int phobos_traceptr(void)  { int n; return (int)(intptr_t)phobos_get_trace(&n); }
EMSCRIPTEN_KEEPALIVE int phobos_leveltime(void) { return leveltime; }  // tics this round
EMSCRIPTEN_KEEPALIVE int phobos_player_dead(void)
{
    return players[consoleplayer].playerstate == PST_DEAD ? 1 : 0;
}

static skill_t phobos_skill(int skill)
{
    if (skill < 1) skill = 1;
    if (skill > 5) skill = 5;
    return (skill_t)(skill - 1);
}

// Begin a seeded captcha round: re-init the arena under `seed` and start
// recording the player's input from tic 0. Difficulty (skill/fast/respawn) is
// the same server config the headless replay applies, so live == replay.
EMSCRIPTEN_KEEPALIVE
void phobos_start(uint32_t s0, uint32_t s1, uint32_t s2, uint32_t s3,
                  int start_map, int wave_count, int skill, int fast, int respawn)
{
    if (wave_count > 0) phobos_set_wave(wave_count);
    phobos_set_difficulty(fast, respawn);   // re-applied in G_DoNewGame
    phobos_replaying = 0;
    phobos_seed(s0, s1, s2, s3);
    phobos_record_begin();
    G_DeferedInitNew(phobos_skill(skill), 1, start_map < 1 ? 1 : start_map);
}

// One frame: advance exactly the game tics owed for real elapsed time + render.
EMSCRIPTEN_KEEPALIVE void phobos_frame(void) { doomgeneric_Tick(); }

int main(void)
{
    static char *args[] = { "phobos", "-iwad", "/phobos.wad", "-warp", "1", "1", 0 };
    doomgeneric_Create(6, args);   // boot + render the (unseeded) arena until phobos_start
    return 0;
}
