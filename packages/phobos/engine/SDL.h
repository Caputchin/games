/* Minimal fake SDL.h for the headless Phobos spike: i_system.c only uses SDL_Quit(). */
#ifndef PHOBOS_FAKE_SDL_H
#define PHOBOS_FAKE_SDL_H
static inline void SDL_Quit(void) {}
#endif
