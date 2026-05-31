# Third-party notices

Wall Smash itself is MIT (see LICENSE). All in-game art is generated procedurally
at runtime (no bundled image assets). It bundles the following third-party
material.

## Engine and libraries

The live build is compiled from Rust against the **Bevy** engine and its
dependency tree, and the **wasm-bindgen** / **web-sys** / **js-sys** glue. These
are dual-licensed **MIT OR Apache-2.0**. The headless replay build uses
**bevy_ecs** under the same terms.
