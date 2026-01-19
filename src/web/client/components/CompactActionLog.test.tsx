import { describe, it, expect } from "@jest/globals"
import { render } from "preact-render-to-string"
import { CompactActionLog } from "./CompactActionLog"
import type { CommandHistoryEntry } from "../hooks/useGameState"

describe("CompactActionLog component", () => {
  const createEntry = (
    command: string,
    success: boolean,
    timestamp: number
  ): CommandHistoryEntry => ({
    command,
    timestamp,
    ticks: [],
    result: {
      success,
      log: [],
    },
  })

  describe("prominent latest action display", () => {
    it("renders the most recent completed entry in latest-action wrapper", () => {
      const history: CommandHistoryEntry[] = [
        createEntry("mine stone", true, 1),
        createEntry("chop wood", true, 2),
        createEntry("gather herbs", true, 3),
      ]

      const html = render(<CompactActionLog history={history} currentCommand={null} />)

      expect(html).toContain('class="latest-action')
      expect(html).toContain("gather herbs")
    })

    it("renders older entries in action-history section", () => {
      const history: CommandHistoryEntry[] = [
        createEntry("mine stone", true, 1),
        createEntry("chop wood", true, 2),
        createEntry("gather herbs", true, 3),
      ]

      const html = render(<CompactActionLog history={history} currentCommand={null} />)

      expect(html).toContain('class="action-history')
    })

    it("separates latest entry from older history", () => {
      const history: CommandHistoryEntry[] = [
        createEntry("mine stone", true, 1),
        createEntry("chop wood", true, 2),
        createEntry("gather herbs", true, 3),
      ]

      const html = render(<CompactActionLog history={history} currentCommand={null} />)

      // Latest action should appear before action-history
      const latestIdx = html.indexOf('class="latest-action')
      const historyIdx = html.indexOf('class="action-history')

      expect(latestIdx).toBeGreaterThan(-1)
      expect(historyIdx).toBeGreaterThan(-1)
      expect(latestIdx).toBeLessThan(historyIdx)
    })

    it("shows current command alongside history", () => {
      const history: CommandHistoryEntry[] = [createEntry("mine stone", true, 1)]
      const currentCommand: CommandHistoryEntry = {
        command: "chop wood",
        timestamp: 2,
        ticks: [],
        result: null,
      }

      const html = render(<CompactActionLog history={history} currentCommand={currentCommand} />)

      expect(html).toContain("mine stone")
      expect(html).toContain("chop wood")
    })

    it("handles empty history gracefully", () => {
      const html = render(<CompactActionLog history={[]} currentCommand={null} />)

      expect(html).toContain("Type a command or click an action to begin")
    })

    it("handles single entry history", () => {
      const history: CommandHistoryEntry[] = [createEntry("mine stone", true, 1)]

      const html = render(<CompactActionLog history={history} currentCommand={null} />)

      expect(html).toContain('class="latest-action')
      expect(html).toContain("mine stone")
    })
  })
})
