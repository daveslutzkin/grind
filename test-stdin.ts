/**
 * Minimal test script to debug stdin/readline behavior
 * Run with: npx tsx test-stdin.ts
 */

import * as readline from "readline"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve)
  })
}

// Simulates what promptYesNo does with raw mode
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

// Simulates what promptYesNo does with a new readline
async function promptYesNoReadline(question: string): Promise<boolean> {
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
  console.log("Testing stdin behavior...\n")

  // First, get a command like the REPL does
  const cmd1 = await prompt("> ")
  console.log(`Got command: "${cmd1}"`)

  // Now pause the main readline (like our fix does)
  rl.pause()

  // Try the raw mode approach
  console.log("\n--- Testing raw mode promptYesNo ---")
  const answer1 = await promptYesNoRaw("Continue?")
  console.log(`Answer was: ${answer1}`)

  // Resume main readline
  rl.resume()

  // Try another command
  const cmd2 = await prompt("\n> ")
  console.log(`Got command: "${cmd2}"`)

  // Pause again
  rl.pause()

  // Try the readline approach
  console.log("\n--- Testing readline promptYesNo ---")
  const answer2 = await promptYesNoReadline("Continue?")
  console.log(`Answer was: ${answer2}`)

  // Resume
  rl.resume()

  // Final command
  const cmd3 = await prompt("\n> ")
  console.log(`Got command: "${cmd3}"`)

  rl.close()
  console.log("\nDone!")
}

main().catch(console.error)
