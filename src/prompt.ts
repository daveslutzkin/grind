/**
 * Shared prompt utilities using raw mode to avoid readline conflicts
 *
 * These utilities use raw mode stdin directly instead of readline.createInterface
 * to prevent conflicts with existing readline instances in the REPL.
 */

/**
 * Prompt user with y/n question using raw mode to avoid readline conflicts
 *
 * This function is safe to call even when a readline interface is active,
 * as it uses raw mode directly instead of creating a new readline interface.
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

  return new Promise((resolve) => {
    process.stdout.write(`${question} (y/n): `)

    // Save current raw mode state
    const wasRaw = process.stdin.isRaw

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf8")

    const handler = (key: string) => {
      process.stdin.removeListener("data", handler)
      process.stdin.setRawMode(wasRaw ?? false)

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
}
