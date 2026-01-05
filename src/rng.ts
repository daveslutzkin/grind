import type { RngState, RngRoll } from "./types.js"

export function createRng(seed: string): RngState {
  return {
    seed,
    counter: 0,
  }
}

// Simple deterministic hash function (cyrb53)
function hash(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function getRandomValue(seed: string, counter: number): number {
  const combined = `${seed}:${counter}`
  const hashValue = hash(combined)
  // Normalize to [0, 1)
  return (hashValue % 1000000) / 1000000
}

/**
 * Get a random float in range [min, max) without logging.
 * Used for internal generation (node generation, variance, etc.)
 */
export function rollFloat(rng: RngState, min: number, max: number, _label: string): number {
  const randomValue = getRandomValue(rng.seed, rng.counter)
  rng.counter++
  return min + randomValue * (max - min)
}

export function roll(rng: RngState, probability: number, label: string, rolls: RngRoll[]): boolean {
  const counterBefore = rng.counter
  const randomValue = getRandomValue(rng.seed, rng.counter)
  rng.counter++

  const result = randomValue < probability

  rolls.push({
    label,
    probability,
    result,
    rngCounter: counterBefore,
  })

  return result
}

/**
 * Roll on a weighted loot table and return the selected entry index.
 * Weights are relative - they don't need to sum to 100.
 * Records a roll for each entry showing whether it was selected.
 */
export function rollLootTable(
  rng: RngState,
  weights: { label: string; weight: number }[],
  rolls: RngRoll[]
): number {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  const counterBefore = rng.counter
  const randomValue = getRandomValue(rng.seed, rng.counter)
  rng.counter++

  // Find which entry the roll falls into
  const rollValue = randomValue * totalWeight
  let cumulative = 0
  let selectedIndex = 0

  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i].weight
    if (rollValue < cumulative) {
      selectedIndex = i
      break
    }
  }

  // Log a roll for each entry showing probability and whether it was selected
  for (let i = 0; i < weights.length; i++) {
    rolls.push({
      label: weights[i].label,
      probability: weights[i].weight / totalWeight,
      result: i === selectedIndex,
      rngCounter: counterBefore,
    })
  }

  return selectedIndex
}
