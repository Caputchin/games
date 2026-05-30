// Phobos headless replay entry. Compiled to dist/phobos.wasm and loaded by the
// replay isolate. Boots DOOM once (R_Init/W_Init, amortized across the warm
// isolate), then phobos_run() re-inits the seeded arena and replays the opaque
// trace, returning the kill count. The JS run() wrapper turns that into the
// {passed, score, durationMs} verdict. No SDL, no rendering, deterministic.
#include <stdint.h>
#include <emscripten.h>
#include "doomgeneric.h"
#include "doomdef.h"
#include "doomstat.h"

extern boolean singletics, nodrawers, screenvisible;
extern void phobos_set_difficulty(int fast, int respawn);   // applied in G_DoNewGame
extern void G_DeferedInitNew(skill_t skill, int episode, int map);
extern gameaction_t gameaction;
extern gamestate_t gamestate;

// Map manifest skill 1..5 to DOOM's skill_t (sk_baby..sk_nightmare).
static skill_t phobos_skill(int skill)
{
    if (skill < 1) skill = 1;
    if (skill > 5) skill = 5;
    return (skill_t)(skill - 1);
}
extern void phobos_seed(uint32_t, uint32_t, uint32_t, uint32_t);
extern void phobos_replay_begin(const unsigned char *, int);
extern void phobos_set_wave(int);
extern int phobos_recording, phobos_replaying;
extern int phobos_kills(void);

// ---- headless DG platform: all no-ops ----
static uint32_t s_ms = 0;
void DG_Init(void) {}
void DG_DrawFrame(void) {}
void DG_SleepMs(uint32_t ms) {}
uint32_t DG_GetTicksMs(void) { return s_ms += 28; }
int DG_GetKey(int *pressed, unsigned char *key) { return 0; }
void DG_SetWindowTitle(const char *title) {}

static int g_booted = 0;

static void boot_once(void)
{
    if (g_booted) return;
    static char *args[] = { "phobos", "-iwad", "/phobos.wad",
                            "-warp", "1", "1", "-nodraw", 0 };
    doomgeneric_Create(7, args);
    singletics = 1; nodrawers = 1; screenvisible = 0;
    g_booted = 1;
}

// Replay one captcha round. seed = 128-bit server seed (4 words); trace = opaque
// recorded ticcmd bytes (4/tic); start_map + wave_count + the pass threshold are
// server-supplied config. Returns kills scored; verdict computed JS-side.
EMSCRIPTEN_KEEPALIVE
int phobos_run(uint32_t s0, uint32_t s1, uint32_t s2, uint32_t s3,
               const uint8_t *trace, int len, int start_map, int wave_count,
               int skill, int fast, int respawn, int max_tics)
{
    boot_once();
    if (start_map < 1) start_map = 1;
    if (wave_count > 0) phobos_set_wave(wave_count);
    // Server-owned difficulty: stashed now, re-applied in G_DoNewGame (which
    // resets these flags). Identical here and in the live build so the replayed
    // verdict matches live play.
    phobos_set_difficulty(fast, respawn);
    phobos_recording = phobos_replaying = 0;
    phobos_seed(s0, s1, s2, s3);
    G_DeferedInitNew(phobos_skill(skill), 1, start_map);
    // Drive from level tic 0 (no free pre-replay tics) for byte-exact replay.
    phobos_replay_begin(trace, len);
    int n = len / 4;
    // Always run >=1 tic so the level loads (resets killcount + spawns the
    // wave). Cap at max_tics: bounds server cost AND enforces the time_limit
    // gate -- the live build stops recording at the same tic, so live==replay.
    int ticks = n < 1 ? 1 : n;
    if (max_tics > 0 && ticks > max_tics) ticks = max_tics;
    for (int i = 0; i < ticks; i++)
        doomgeneric_Tick();
    phobos_replaying = 0;
    return phobos_kills();
}

int main(void) { boot_once(); return 0; }   // EXIT_RUNTIME=0 keeps the isolate warm
