// Headless no-op sound backend for the Phobos cpuMs spike.
// Replaces i_sound.c (which hard-includes <SDL_mixer.h>) so the replay/headless
// build links without SDL. Sound is irrelevant to the deterministic sim.
#include "doomtype.h"
#include "i_sound.h"

// Config globals normally defined in i_sound.c; referenced by s_sound.c / m_config.c.
int snd_sfxdevice = SNDDEVICE_SB;
int snd_musicdevice = SNDDEVICE_SB;
int snd_samplerate = 44100;
int snd_cachesize = 64 * 1024 * 1024;
int snd_maxslicetime_ms = 28;
char *snd_musiccmd = "";
int snd_pitchshift = 0;

void I_InitSound(boolean use_sfx_prefix) {}
void I_ShutdownSound(void) {}
int  I_GetSfxLumpNum(sfxinfo_t *sfxinfo) { return 0; }
void I_UpdateSound(void) {}
void I_UpdateSoundParams(int channel, int vol, int sep) {}
int  I_StartSound(sfxinfo_t *sfxinfo, int channel, int vol, int sep) { return -1; }
void I_StopSound(int channel) {}
boolean I_SoundIsPlaying(int channel) { return false; }
void I_PrecacheSounds(sfxinfo_t *sounds, int num_sounds) {}

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
