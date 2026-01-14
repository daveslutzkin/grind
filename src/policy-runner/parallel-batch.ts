/**
 * Parallel Batch Executor
 *
 * Runs multiple simulations in parallel using worker threads.
 * Each worker runs one simulation at a time, with tasks distributed
 * across the worker pool.
 */

import { Worker } from "node:worker_threads"
import { cpus } from "node:os"
import { fileURLToPath } from "node:url"
import path from "node:path"

import type { BatchConfig, BatchResult, RunResult } from "./types.js"
import { computeAllAggregates } from "./metrics.js"
import type { WorkerTask, WorkerMessage } from "./simulation-worker.js"

/**
 * Extended batch config with parallel options.
 */
export interface ParallelBatchConfig extends BatchConfig {
  maxWorkers?: number // Default: number of CPU cores
}

/**
 * Generate deterministic seed strings.
 */
function generateSeeds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `seed-${i}`)
}

/**
 * Get the path to the compiled worker script.
 */
function getWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = path.dirname(currentFile)

  // Check if we're in source or compiled directory
  if (currentDir.includes("/src/")) {
    // Running from source (e.g., in tests) - point to compiled dist
    const projectRoot = currentDir.replace(/\/src\/.*$/, "")
    return path.join(projectRoot, "dist", "policy-runner", "simulation-worker.js")
  }

  // Running from compiled code - worker is in same directory
  return path.join(currentDir, "simulation-worker.js")
}

/**
 * Run batch simulations in parallel using worker threads.
 *
 * @param config Batch configuration with optional parallel settings
 * @returns Aggregated results
 */
export async function runBatchParallel(config: ParallelBatchConfig): Promise<BatchResult> {
  const seeds = config.seeds ?? generateSeeds(config.seedCount ?? 100)
  const numWorkers = Math.min(
    config.maxWorkers ?? cpus().length,
    seeds.length * config.policies.length
  )

  // Build list of all tasks (seed × policy combinations)
  const tasks: WorkerTask[] = []
  for (const seed of seeds) {
    for (const policy of config.policies) {
      tasks.push({
        seed,
        policyId: policy.id,
        targetLevel: config.targetLevel,
        maxTicks: config.maxTicks,
        stallWindowSize: config.stallWindowSize,
      })
    }
  }

  // If only 1 worker or 1 task, just run sequentially to avoid overhead
  if (numWorkers <= 1 || tasks.length <= 1) {
    return runSequentially(tasks, config)
  }

  const results: RunResult[] = []
  const workerPath = getWorkerPath()

  return new Promise((resolve, reject) => {
    let taskIndex = 0
    let completedCount = 0
    let hasError = false
    const workers: Worker[] = []

    function spawnWorker(): Worker {
      const worker = new Worker(workerPath)

      worker.on("message", (message: WorkerMessage) => {
        if (hasError) return

        if (message.type === "error") {
          hasError = true
          terminateAllWorkers()
          reject(new Error(`Worker error for seed ${message.seed}: ${message.error}`))
          return
        }

        results.push(message.result)
        completedCount++
        config.onProgress?.()

        // Check if all tasks are done
        if (completedCount === tasks.length) {
          terminateAllWorkers()
          const policyIds = config.policies.map((p) => p.id)
          const aggregates = computeAllAggregates(results, policyIds)
          resolve({
            results,
            aggregates: { byPolicy: aggregates },
          })
          return
        }

        // Dispatch next task if available
        if (taskIndex < tasks.length) {
          worker.postMessage(tasks[taskIndex++])
        }
      })

      worker.on("error", (err) => {
        if (hasError) return
        hasError = true
        terminateAllWorkers()
        reject(err)
      })

      return worker
    }

    function terminateAllWorkers(): void {
      for (const worker of workers) {
        worker.terminate()
      }
    }

    // Spawn workers and dispatch initial tasks
    for (let i = 0; i < numWorkers; i++) {
      const worker = spawnWorker()
      workers.push(worker)
      if (taskIndex < tasks.length) {
        worker.postMessage(tasks[taskIndex++])
      }
    }
  })
}

/**
 * Run tasks sequentially (fallback for small batches).
 */
async function runSequentially(tasks: WorkerTask[], config: BatchConfig): Promise<BatchResult> {
  // Import dynamically to avoid circular dependency issues
  const { runSimulation } = await import("./runner.js")
  const { getPolicyById } = await import("./policies/index.js")

  const results: RunResult[] = []

  for (const task of tasks) {
    const policy = getPolicyById(task.policyId)
    if (!policy) {
      throw new Error(`Unknown policy ID: ${task.policyId}`)
    }

    const result = await runSimulation({
      seed: task.seed,
      policy,
      targetLevel: task.targetLevel,
      maxTicks: task.maxTicks,
      stallWindowSize: task.stallWindowSize,
    })
    results.push(result)
    config.onProgress?.()
  }

  const policyIds = config.policies.map((p) => p.id)
  const aggregates = computeAllAggregates(results, policyIds)

  return {
    results,
    aggregates: { byPolicy: aggregates },
  }
}
