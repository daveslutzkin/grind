/**
 * LLM response caching for deterministic replays.
 *
 * When enabled, LLM responses are saved to a file on first run,
 * and replayed from the file on subsequent runs with the same seed.
 */

import { readFileSync, writeFileSync, existsSync } from "fs"

interface CachedResponse {
  prompt: string
  response: string
}

interface LLMCache {
  responses: CachedResponse[]
  replayIndex: number
}

let globalCache: LLMCache | null = null
let cacheFilePath: string | null = null

/**
 * Initialize the LLM cache.
 * If the file exists, load cached responses for replay.
 * If not, start with an empty cache that will be saved on exit.
 */
export function initLLMCache(filePath: string): void {
  cacheFilePath = filePath

  if (existsSync(filePath)) {
    try {
      const data = readFileSync(filePath, "utf-8")
      const responses = JSON.parse(data) as CachedResponse[]
      globalCache = { responses, replayIndex: 0 }
    } catch {
      // If file is corrupted, start fresh
      globalCache = { responses: [], replayIndex: 0 }
    }
  } else {
    globalCache = { responses: [], replayIndex: 0 }
  }
}

/**
 * Save the cache to file.
 * Call this at the end of a session to persist new responses.
 */
export function saveLLMCache(): void {
  if (globalCache && cacheFilePath) {
    writeFileSync(cacheFilePath, JSON.stringify(globalCache.responses, null, 2))
  }
}

/**
 * Check if cache is enabled.
 */
export function isCacheEnabled(): boolean {
  return globalCache !== null
}

/**
 * Get a cached response or return undefined if we need to call the LLM.
 * If replaying and we have a cached response, return it.
 * If we've exhausted cached responses, return undefined to trigger a real LLM call.
 */
export function getCachedResponse(prompt: string): string | undefined {
  if (!globalCache) return undefined

  // If we have more cached responses to replay, use them
  if (globalCache.replayIndex < globalCache.responses.length) {
    const cached = globalCache.responses[globalCache.replayIndex]
    globalCache.replayIndex++
    return cached.response
  }

  return undefined
}

/**
 * Store a new LLM response in the cache.
 * Called after making a real LLM call.
 */
export function storeCachedResponse(prompt: string, response: string): void {
  if (!globalCache) return

  globalCache.responses.push({ prompt, response })
}

/**
 * Reset the cache (for testing).
 */
export function resetLLMCache(): void {
  globalCache = null
  cacheFilePath = null
}
