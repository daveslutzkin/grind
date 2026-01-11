/**
 * Centralized input manager that owns the readline interface
 *
 * This module manages all stdin interactions to prevent readline conflicts.
 * Any code needing user input should use this module instead of creating
 * its own readline interface.
 */

import * as readline from "readline"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

let rl: readline.Interface | null = null

// History configuration
const HISTORY_SIZE = 100
const HISTORY_FILE = path.join(os.homedir(), ".grind_history")

// In-memory history that persists across readline restarts
let commandHistory: string[] = []

// Track pending prompt to handle signals gracefully
let pendingPromptResolve: ((value: string) => void) | null = null

/**
 * Load history from file on startup
 */
function loadHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, "utf8")
      return content
        .split("\n")
        .filter((line) => line.trim())
        .slice(-HISTORY_SIZE)
    }
  } catch {
    // Silently ignore history load errors
  }
  return []
}

/**
 * Save history to file
 */
function saveHistory(): void {
  try {
    fs.writeFileSync(HISTORY_FILE, commandHistory.join("\n") + "\n", "utf8")
  } catch {
    // Silently ignore history save errors
  }
}

/**
 * Add a command to history (avoiding duplicates of the last entry)
 */
export function addToHistory(command: string): void {
  const trimmed = command.trim()
  if (!trimmed) return

  // Don't add if it's the same as the last command
  if (commandHistory.length > 0 && commandHistory[commandHistory.length - 1] === trimmed) {
    return
  }

  commandHistory.push(trimmed)

  // Trim to max size
  if (commandHistory.length > HISTORY_SIZE) {
    commandHistory = commandHistory.slice(-HISTORY_SIZE)
  }

  // Save to file after each addition
  saveHistory()
}

/**
 * Initialize the input manager. Must be called before using prompt functions.
 */
export function initInput(): void {
  if (rl) return

  // Load history from file on first init
  if (commandHistory.length === 0) {
    commandHistory = loadHistory()
  }

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: [...commandHistory],
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
  })

  // Capture history additions from readline
  rl.on("history", (history: string[]) => {
    if (history.length > 0) {
      const latest = history[0] // Most recent is at index 0
      addToHistory(latest)
    }
  })

  // Handle Ctrl+C (SIGINT) gracefully - treat as "end" command
  rl.on("SIGINT", () => {
    if (pendingPromptResolve) {
      process.stdout.write("\n") // Add newline for clean output
      pendingPromptResolve("end")
      pendingPromptResolve = null
    }
  })

  // Handle Ctrl+D (EOF/close) gracefully - treat as "end" command
  rl.on("close", () => {
    if (pendingPromptResolve) {
      process.stdout.write("\n") // Add newline for clean output
      pendingPromptResolve("end")
      pendingPromptResolve = null
    }
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
    // Store resolve callback so signal handlers can gracefully end the session
    pendingPromptResolve = resolve
    rl!.question(question, (answer) => {
      // Clear the pending callback when normal input is received
      pendingPromptResolve = null
      resolve(answer)
    })
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
    // Reopen readline if it was open before (use initInput to get history)
    if (hadReadline) {
      initInput()
    }
  }
}
