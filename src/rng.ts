import type { RngState, RngRoll } from './types.js';

export function createRng(seed: string): RngState {
  return {
    seed,
    counter: 0,
  };
}

// Simple deterministic hash function (cyrb53)
function hash(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function getRandomValue(seed: string, counter: number): number {
  const combined = `${seed}:${counter}`;
  const hashValue = hash(combined);
  // Normalize to [0, 1)
  return (hashValue % 1000000) / 1000000;
}

export function roll(
  rng: RngState,
  probability: number,
  label: string,
  rolls: RngRoll[]
): boolean {
  const counterBefore = rng.counter;
  const randomValue = getRandomValue(rng.seed, rng.counter);
  rng.counter++;

  const result = randomValue < probability;

  rolls.push({
    label,
    probability,
    result,
    rngCounter: counterBefore,
  });

  return result;
}
