/**
 * Centralized input manager that owns the readline interface
 *
 * This module manages all stdin interactions to prevent readline conflicts.
 * Any code needing user input should use this module instead of creating
 * its own readline interface.
 */

import * as readline from "readline"

let rl: readline.Interface | null = null

/**
 * Initialize the input manager. Must be called before using prompt functions.
 */
export function initInput(): void {
  if (rl) return
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * Close the input manager. Call when done with all input.
 */
export function closeInput(): void {
  if (rl) {
    rl.close()
    rl = null
  }
}

/**
 * Prompt for a line of text input using readline.
 */
export async function promptLine(question: string): Promise<string> {
  if (!rl) {
    throw new Error("Input manager not initialized. Call initInput() first.")
  }
  return new Promise((resolve) => {
    rl!.question(question, resolve)
  })
}

/**
 * Prompt user with y/n question.
 *
 * This automatically handles closing and reopening the readline interface
 * to use raw mode for single-character input without conflicts.
 *
 * @param question The question to ask (without the "(y/n)" suffix)
 * @returns true if user answered 'y' or 'yes', false otherwise
 */
export async function promptYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-interactive mode: default to no
    console.log(`${question} (y/n) [auto: n]`)
    return false
  }

  // Close readline to release stdin
  const hadReadline = rl !== null
  if (hadReadline) {
    rl!.close()
    rl = null
  }

  try {
    return await new Promise((resolve) => {
      process.stdout.write(`${question} (y/n): `)

      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding("utf8")

      const handler = (key: string) => {
        process.stdin.removeListener("data", handler)
        process.stdin.setRawMode(false)
        process.stdin.pause()

        // Handle Ctrl+C
        if (key === "\u0003") {
          process.stdout.write("\n")
          process.exit(0)
        }

        // Echo the key and newline
        process.stdout.write(key + "\n")

        const normalized = key.toLowerCase()
        resolve(normalized === "y" || normalized === "yes")
      }

      process.stdin.once("data", handler)
    })
  } finally {
    // Reopen readline if it was open before
    if (hadReadline) {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    }
  }
}
