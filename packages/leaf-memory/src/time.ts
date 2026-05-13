// Injectable clock so tests can drive time without real-world delay.
// Production code uses performance.now() via the default factory.

export interface Clock {
  now(): number;
}

export const realClock: Clock = {
  now: () => performance.now(),
};
