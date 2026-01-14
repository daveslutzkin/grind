/**
 * Worker thread for running policy simulations in parallel.
 *
 * Workers receive simulation tasks via parentPort and return results.
 * Policies are looked up by ID since functions can't be serialized.
 */

import { parentPort } from "node:worker_threads"
import { runSimulation } from "./runner.js"
import { getPolicyById } from "./policies/index.js"
import type { RunResult } from "./types.js"

/**
 * Message sent to the worker to run a simulation.
 */
export interface WorkerTask {
  seed: string
  policyId: string
  targetLevel: number
  maxTicks: number
  stallWindowSize?: number
}

/**
 * Message sent from the worker with the result.
 */
export interface WorkerResult {
  type: "result"
  result: RunResult
}

/**
 * Error message sent from the worker.
 */
export interface WorkerError {
  type: "error"
  error: string
  seed: string
  policyId: string
}

export type WorkerMessage = WorkerResult | WorkerError

if (parentPort) {
  parentPort.on("message", async (task: WorkerTask) => {
    try {
      const policy = getPolicyById(task.policyId)
      if (!policy) {
        parentPort!.postMessage({
          type: "error",
          error: `Unknown policy ID: ${task.policyId}`,
          seed: task.seed,
          policyId: task.policyId,
        } satisfies WorkerError)
        return
      }

      const result = await runSimulation({
        seed: task.seed,
        policy,
        targetLevel: task.targetLevel,
        maxTicks: task.maxTicks,
        stallWindowSize: task.stallWindowSize,
      })

      parentPort!.postMessage({
        type: "result",
        result,
      } satisfies WorkerResult)
    } catch (err) {
      parentPort!.postMessage({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
        seed: task.seed,
        policyId: task.policyId,
      } satisfies WorkerError)
    }
  })
}
