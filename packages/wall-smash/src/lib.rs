//! Wall Smash: an Arkanoid/Breakout captcha game built on Bevy.
//!
//! One shared sim (`sim`, authored as Bevy ECS) compiles into two builds:
//!   - default (`bevy_ecs` only)  -> `headless`: the C-ABI replay artifact.
//!   - feature `render` (full Bevy) -> `live`: the WebGL browser game.
//! The same sim systems run both ends, which is the determinism guarantee.

pub mod codec;
pub mod sim;

#[cfg(not(feature = "render"))]
mod headless;

#[cfg(feature = "render")]
mod live;
