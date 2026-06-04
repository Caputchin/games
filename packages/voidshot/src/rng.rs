//! Seeded deterministic PRNG (xorshift32). The ONLY source of randomness in the
//! sim (wave composition, spawn angles, weaver phases) all draw from the
//! platform seed. Never `Math::random`, never a clock. Float helpers use plain
//! IEEE-754 ops which are bit-identical because the same wasm runs both ends.

#[derive(Clone)]
pub struct Rng {
    state: u32,
}

impl Rng {
    /// Fold the four-word platform seed into a non-zero 32-bit state.
    pub fn new(seed: [u32; 4]) -> Self {
        let mut s = seed[0]
            ^ seed[1].rotate_left(7)
            ^ seed[2].rotate_left(15)
            ^ seed[3].rotate_left(23);
        if s == 0 {
            s = 0x9e37_79b9;
        }
        Rng { state: s }
    }

    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }

    /// Uniform in [0, 1). 24-bit mantissa precision.
    pub fn f32_01(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32
    }

    /// Uniform in [a, b).
    pub fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.f32_01()
    }

    /// Integer in [0, n).
    pub fn below(&mut self, n: u32) -> u32 {
        if n == 0 {
            0
        } else {
            self.next_u32() % n
        }
    }
}
