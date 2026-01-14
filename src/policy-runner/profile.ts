/**
 * Profiling script to measure actual performance bottlenecks.
 * Run with: npx tsx src/policy-runner/profile.ts
 */

import { runSimulation } from "./runner.js"
import { allPolicies } from "./policies/index.js"

interface TimingData {
  count: number
  totalMs: number
}

const timings: Record<string, TimingData> = {}

function recordTiming(name: string, ms: number) {
  if (!timings[name]) {
    timings[name] = { count: 0, totalMs: 0 }
  }
  timings[name].count++
  timings[name].totalMs += ms
}

// Monkey-patch console.time/timeEnd for measurement
const originalTime = console.time.bind(console)
const originalTimeEnd = console.timeEnd.bind(console)
const timeStarts: Record<string, number> = {}

console.time = (label?: string) => {
  if (label) timeStarts[label] = performance.now()
}

console.timeEnd = (label?: string) => {
  if (label && timeStarts[label]) {
    recordTiming(label, performance.now() - timeStarts[label])
    delete timeStarts[label]
  }
}

async function main() {
  const policy = allPolicies.find((p) => p.id === "safe")!
  const seeds = ["seed-0", "seed-1", "seed-2"]
  const targetLevel = 10
  const maxTicks = 50000

  console.log("Running profiled simulations...")
  console.log(`Seeds: ${seeds.length}, Target Level: ${targetLevel}, Max Ticks: ${maxTicks}`)
  console.log()

  const overallStart = performance.now()

  for (const seed of seeds) {
    const start = performance.now()
    await runSimulation({
      seed,
      policy,
      targetLevel,
      maxTicks,
    })
    const elapsed = performance.now() - start
    console.log(`  ${seed}: ${elapsed.toFixed(0)}ms`)
  }

  const overallElapsed = performance.now() - overallStart
  console.log()
  console.log(
    `Total: ${overallElapsed.toFixed(0)}ms (${(overallElapsed / seeds.length).toFixed(0)}ms avg per run)`
  )
  console.log()

  // Breakdown per-tick estimation
  const avgTicks = 40000 // approximate average ticks per stalled run
  const ticksPerSecond = (avgTicks * seeds.length) / (overallElapsed / 1000)
  console.log(`Estimated ticks/second: ${ticksPerSecond.toFixed(0)}`)
  console.log(`Target: ~500,000 ticks/second (for 1s with 10 runs x 50k ticks)`)
  console.log(`Current efficiency: ${((ticksPerSecond / 500000) * 100).toFixed(1)}%`)
}

main().catch(console.error)
