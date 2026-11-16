// Seeded randomness: one mulberry32 stream per seed, so a screenshot pose with
// &seed=N plays the same every time it loads. The live game seeds from the clock.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one entry of an array with a stream.
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}
