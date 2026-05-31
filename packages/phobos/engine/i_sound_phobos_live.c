// Phobos LIVE sound backend: a small software SFX mixer wired to Web Audio.
//
// Replaces i_sound_stub.c in the LIVE build ONLY (the headless/replay build keeps
// the silent stub -- the deterministic sim must never depend on audio). DOOM's
// s_sound.c calls this flat I_* interface directly (no module dispatch), so we
// implement the same entry points the stub did, but back them with a real mixer.
//
// SFX only. Each active s_sound channel resamples its 8-bit DMX lump (nearest
// neighbour, ~11 kHz -> the AudioContext rate) and we sum the channels into a
// stereo float buffer that a ScriptProcessorNode pulls. No SDL: keeps the live
// bundle lean (no SDL2/SDL_mixer) and needs no sidecar (CSP forbids fetch).
//
// MUS/OPL music is intentionally out of scope here (an OPL synth + GENMIDI would
// dwarf the SFX cost); the music I_* entry points stay no-ops.
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <emscripten.h>
#include "doomtype.h"
#include "i_sound.h"
#include "w_wad.h"
#include "z_zone.h"

// Config globals normally defined in i_sound.c; referenced by s_sound.c / m_config.c.
// (The stub defined these for the headless build; the live build defines them here.)
int snd_sfxdevice = SNDDEVICE_SB;
int snd_musicdevice = SNDDEVICE_SB;
int snd_samplerate = 44100;
int snd_cachesize = 64 * 1024 * 1024;
int snd_maxslicetime_ms = 28;
char *snd_musiccmd = "";
int snd_pitchshift = 0;

#define NUM_CH      32          // >= s_sound's channel count (default 8); guarded
#define MAX_FRAMES  4096        // ScriptProcessor pull size ceiling
#define DMX_DEFRATE 11025       // DMX sample rate fallback when the header reads 0

typedef struct {
    const uint8_t *data;        // 8-bit unsigned PCM samples
    uint32_t       len;         // sample count
    uint32_t       pos;         // 16.16 fixed-point read cursor into data
    uint32_t       step;        // (srate << 16) / out_rate
    int            leftvol;     // 0..127
    int            rightvol;    // 0..127
    boolean        active;
} mixchan_t;

static mixchan_t chans[NUM_CH];
static int       out_rate = 44100;   // actual AudioContext rate (set at init)
static int       muted = 0;
static boolean   use_prefix = true;

// ---- JS audio plumbing (Web Audio via a ScriptProcessorNode) ----
// Creates a suspended AudioContext at boot (no user gesture yet) and a node that
// pulls phobos_audio_pull() each block. Returns the context's real sample rate,
// or 0 if Web Audio is unavailable (we then run silently). Re-reads HEAPF32 every
// block (ALLOW_MEMORY_GROWTH can detach the view).
EM_JS(int, phobos_audio_init_js, (int desiredRate), {
    if (typeof window === 'undefined') return 0;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return 0;
    var ctx;
    try { ctx = new Ctx({ sampleRate: desiredRate }); }
    catch (e) { try { ctx = new Ctx(); } catch (e2) { return 0; } }
    var FR = 2048;
    var ptr = _malloc(FR * 2 * 4);            // float32 stereo scratch
    var node = ctx.createScriptProcessor(FR, 0, 2);
    node.onaudioprocess = function (e) {
        var frames = e.outputBuffer.length;
        _phobos_audio_pull(ptr, frames);
        var base = ptr >> 2;
        var heap = HEAPF32;                    // re-read each block (growth-safe)
        var L = e.outputBuffer.getChannelData(0);
        var R = e.outputBuffer.getChannelData(1);
        for (var i = 0; i < frames; i++) { L[i] = heap[base + 2*i]; R[i] = heap[base + 2*i + 1]; }
    };
    node.connect(ctx.destination);
    Module._pa_ctx = ctx; Module._pa_node = node;
    return ctx.sampleRate | 0;
});

EM_JS(void, phobos_audio_resume_js, (void), {
    if (Module._pa_ctx && Module._pa_ctx.state === 'suspended') {
        Module._pa_ctx.resume();
    }
});

// Resume the AudioContext from a user gesture (game.ts calls this on the Enter
// click). Browsers start the context suspended until a gesture.
EMSCRIPTEN_KEEPALIVE void phobos_audio_resume(void) { phobos_audio_resume_js(); }

// Mute toggle (live chrome button). Muted = output silence; channels keep
// advancing so unmuting resumes mid-sound naturally rather than replaying.
EMSCRIPTEN_KEEPALIVE void phobos_set_mute(int m) { muted = m ? 1 : 0; }

// Mix all active channels for `frames` stereo float samples. Called from the JS
// audio callback (main thread, single-threaded wasm -> no races with the sim).
EMSCRIPTEN_KEEPALIVE
void phobos_audio_pull(float *out, int frames)
{
    if (frames > MAX_FRAMES) frames = MAX_FRAMES;
    float gain = muted ? 0.0f : 1.0f;
    for (int f = 0; f < frames; f++) {
        float l = 0.0f, r = 0.0f;
        for (int c = 0; c < NUM_CH; c++) {
            mixchan_t *ch = &chans[c];
            if (!ch->active) continue;
            uint32_t idx = ch->pos >> 16;
            if (idx >= ch->len) { ch->active = false; continue; }
            float s = ((int)ch->data[idx] - 128) * (1.0f / 128.0f);  // -1..~1
            l += s * (ch->leftvol  * (1.0f / 127.0f));
            r += s * (ch->rightvol * (1.0f / 127.0f));
            ch->pos += ch->step;
        }
        // Hard-clamp the summed channels (DOOM mixes the same way).
        if (l < -1.0f) l = -1.0f; else if (l > 1.0f) l = 1.0f;
        if (r < -1.0f) r = -1.0f; else if (r > 1.0f) r = 1.0f;
        out[2*f]     = l * gain;
        out[2*f + 1] = r * gain;
    }
}

// Pan/volume split from s_sound's vol (0..127) + sep (0..254). Smooth quadratic
// curve; exactness is unimportant (live-only, no determinism impact).
static void calc_vol(int vol, int sep, int *lv, int *rv)
{
    if (vol < 0) vol = 0; else if (vol > 127) vol = 127;
    sep += 1;                                   // 1..255
    int l = vol - ((vol * sep * sep) >> 16);
    int rs = 255 - sep;
    int r = vol - ((vol * rs * rs) >> 16);
    *lv = l < 0 ? 0 : l;
    *rv = r < 0 ? 0 : r;
}

void I_InitSound(boolean use_sfx_prefix)
{
    use_prefix = use_sfx_prefix;
    memset(chans, 0, sizeof(chans));
    int rate = phobos_audio_init_js(snd_samplerate);
    out_rate = rate > 0 ? rate : snd_samplerate;   // 0 => Web Audio absent, run silent
}

void I_ShutdownSound(void) {}

int I_GetSfxLumpNum(sfxinfo_t *sfxinfo)
{
    char namebuf[16];
    if (use_prefix) snprintf(namebuf, sizeof(namebuf), "ds%s", sfxinfo->name);
    else            snprintf(namebuf, sizeof(namebuf), "%s", sfxinfo->name);
    int n = W_CheckNumForName(namebuf);
    return n;   // -1 if missing; I_StartSound guards
}

void I_UpdateSound(void) {}   // mixing happens in the JS-pulled phobos_audio_pull

void I_UpdateSoundParams(int channel, int vol, int sep)
{
    if (channel < 0 || channel >= NUM_CH) return;
    calc_vol(vol, sep, &chans[channel].leftvol, &chans[channel].rightvol);
}

int I_StartSound(sfxinfo_t *sfxinfo, int channel, int vol, int sep)
{
    if (channel < 0 || channel >= NUM_CH) return -1;
    int lump = sfxinfo->lumpnum >= 0 ? sfxinfo->lumpnum : I_GetSfxLumpNum(sfxinfo);
    if (lump < 0) return -1;

    int len = W_LumpLength(lump);
    if (len < 8) return -1;
    const uint8_t *d = (const uint8_t *)W_CacheLumpNum(lump, PU_STATIC);

    int srate = d[2] | (d[3] << 8);
    if (srate <= 0) srate = DMX_DEFRATE;
    uint32_t dlen = d[4] | (d[5] << 8) | (d[6] << 16) | ((uint32_t)d[7] << 24);
    const uint8_t *samp = d + 8;
    uint32_t scount = dlen;
    if (scount > (uint32_t)(len - 8)) scount = (uint32_t)(len - 8);  // guard bad header
    if (scount >= 32) { samp += 16; scount -= 32; }                  // skip DMX 16-byte pads
    if (scount == 0) return -1;

    mixchan_t *ch = &chans[channel];
    ch->data = samp;
    ch->len  = scount;
    ch->pos  = 0;
    ch->step = ((uint32_t)srate << 16) / (uint32_t)out_rate;
    if (ch->step == 0) ch->step = 1;
    calc_vol(vol, sep, &ch->leftvol, &ch->rightvol);
    ch->active = true;
    return channel;   // handle == channel (s_sound passes it back to the I_* below)
}

void I_StopSound(int channel)
{
    if (channel < 0 || channel >= NUM_CH) return;
    chans[channel].active = false;
}

boolean I_SoundIsPlaying(int channel)
{
    if (channel < 0 || channel >= NUM_CH) return false;
    return chans[channel].active;
}

void I_PrecacheSounds(sfxinfo_t *sounds, int num_sounds) {}

// ---- Music: out of scope for the live build (no OPL synth). No-ops. ----
void I_InitMusic(void) {}
void I_ShutdownMusic(void) {}
void I_SetMusicVolume(int volume) {}
void I_PauseSong(void) {}
void I_ResumeSong(void) {}
void *I_RegisterSong(void *data, int len) { return 0; }
void I_UnRegisterSong(void *handle) {}
void I_PlaySong(void *handle, boolean looping) {}
void I_StopSong(void) {}
boolean I_MusicIsPlaying(void) { return false; }

void I_BindSoundVariables(void) {}
/* I_InitTimidityConfig provided by dummy.c */
