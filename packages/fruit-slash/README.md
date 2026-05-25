# Fruit Slash

Swipe to slice the flying fruit, avoid the bombs. A Caputchin first-party game,
written clean-room in framework-free TypeScript and rendered on a 2D canvas so
the play field is opaque to DOM scrapers.

## How it plays

Fruit and the occasional bomb are launched from the bottom of the field on real
projectile arcs (constant horizontal velocity, gravity-only vertical). They
enter and leave only through the bottom border, never crossing a side or the
top. Swipe across a fruit to slice it; let a fruit fall past the floor unsliced,
or slice a bomb, and you lose a life.

Slicing the configured **pass score** of fruit reports success (`bridge.pass`)
and lights a **Verified** badge, but the round does **not** stop there: you keep
slicing to raise your score, and the final (highest) score is re-reported when
the round ends. The round ends only when lives run out. Difficulty **ramps up
over time** (faster spawns, more bombs), so the score chase gets harder.

Sound effects (slice / miss / verify) are synthesized at runtime (no audio
files); an in-game mute toggle turns them on/off, and the host can default them
off via config. Colors, the fruit palette, and optional fruit/bomb art are
skinnable; difficulty (pass score, lives, spawn rate, gravity, bomb chance) is
configurable; all copy is localized. Light and dark are separate skins the host
picks.

## Frame-rate independence

The game runs its own `requestAnimationFrame` loop driven by real elapsed time:
every physics step is scaled by the delta in seconds (clamped after a stall),
and the field is rendered every frame at the native refresh rate. The arc plays
at the same real-world speed on a 60Hz or a 240Hz display. This is enforced by
`tests/frame-rate.test.ts`; do not reintroduce any per-frame ("MS_PER_FRAME")
coupling.

## Storage

The game runs in a sandboxed, opaque-origin iframe, so `localStorage` is
unavailable. No score is persisted; session state is in memory only.
