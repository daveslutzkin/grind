/**
 * Minimal test script to debug stdin/readline behavior
 * Run with: npx tsx test-stdin.ts
 */

import * as readline from "readline"

let rl: readline.Interface

function createReadline() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve)
  })
}

// Approach 1: Raw mode (current broken approach)
async function promptYesNoRaw(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`${question} (y/n) `)

    const wasRaw = process.stdin.isRaw

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf8")

    const handler = (key: string) => {
      process.stdin.removeListener("data", handler)
      process.stdin.setRawMode(wasRaw ?? false)

      if (key === "\u0003") {
        process.stdout.write("\n")
        process.exit(0)
      }

      process.stdout.write(key + "\n")
      resolve(key.toLowerCase() === "y")
    }

    process.stdin.once("data", handler)
  })
}

// Approach 2: Create new readline for prompt
async function promptYesNoNewReadline(question: string): Promise<boolean> {
  const rl2 = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl2.question(`${question} (y/n) `, (answer) => {
      rl2.close()
      resolve(answer.trim().toLowerCase() === "y")
    })
  })
}

async function main() {
  createReadline()
  console.log("Testing stdin behavior with CLOSE/RECREATE approach...\n")

  // First, get a command like the REPL does
  const cmd1 = await prompt("> ")
  console.log(`Got command: "${cmd1}"`)

  // CLOSE the readline entirely (not just pause)
  rl.close()

  // Try the raw mode approach
  console.log("\n--- Testing raw mode promptYesNo (after closing readline) ---")
  const answer1 = await promptYesNoRaw("Continue?")
  console.log(`Answer was: ${answer1}`)

  // Recreate the readline
  createReadline()

  // Try another command
  const cmd2 = await prompt("\n> ")
  console.log(`Got command: "${cmd2}"`)

  // Close again
  rl.close()

  // Try the new readline approach
  console.log("\n--- Testing new readline promptYesNo (after closing main readline) ---")
  const answer2 = await promptYesNoNewReadline("Continue?")
  console.log(`Answer was: ${answer2}`)

  // Recreate
  createReadline()

  // Final command
  const cmd3 = await prompt("\n> ")
  console.log(`Got command: "${cmd3}"`)

  rl.close()
  console.log("\nDone!")
}

main().catch(console.error)
