import { describe, it, expect, beforeEach, afterEach } from "@jest/globals"
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { createTraceWriter, TraceWriter, TraceEntry, AgentSessionStats } from "./output.js"
import { RULES_VERSION } from "./config.js"

describe("Output", () => {
  const testDir = "/tmp/grind-test-traces"

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  describe("createTraceWriter", () => {
    it("should create a trace writer", () => {
      const writer = createTraceWriter({
        baseDir: testDir,
        seed: "test-seed",
        ticks: 25,
        objective: "explore",
      })

      expect(writer).toBeDefined()
    })

    it("should create output directory with rules version", () => {
      const writer = createTraceWriter({
        baseDir: testDir,
        seed: "test-seed",
        ticks: 25,
        objective: "explore",
      })

      writer.writeHeader()

      const expectedDir = join(testDir, RULES_VERSION, "test-seed")
      expect(existsSync(expectedDir)).toBe(true)
    })
  })

  describe("TraceWriter", () => {
    let writer: TraceWriter

    beforeEach(() => {
      writer = createTraceWriter({
        baseDir: testDir,
        seed: "test-seed-123",
        ticks: 25,
        objective: "test objective",
      })
    })

    it("should write header with session info", () => {
      writer.writeHeader()

      const tracePath = join(testDir, RULES_VERSION, "test-seed-123", "trace.txt")
      expect(existsSync(tracePath)).toBe(true)

      const content = readFileSync(tracePath, "utf-8")
      expect(content).toContain("Seed: test-seed-123")
      expect(content).toContain("Ticks: 25")
      expect(content).toContain("Objective: test objective")
    })

    it("should write trace entries", () => {
      writer.writeHeader()

      const entry: TraceEntry = {
        tick: 0,
        state: "Location: TOWN, Inventory: empty",
        reasoning: "I should explore the world",
        action: "Move to OUTSKIRTS_MINE",
        result: "SUCCESS - arrived at OUTSKIRTS_MINE",
        learning: "Travel takes time",
      }

      writer.writeEntry(entry)

      const tracePath = join(testDir, RULES_VERSION, "test-seed-123", "trace.txt")
      const content = readFileSync(tracePath, "utf-8")
      expect(content).toContain("=== TICK 0 ===")
      expect(content).toContain("I should explore the world")
      expect(content).toContain("Move to OUTSKIRTS_MINE")
    })

    it("should write session summary at end", () => {
      writer.writeHeader()

      const stats: AgentSessionStats = {
        totalTicks: 25,
        ticksUsed: 20,
        actionsAttempted: 10,
        actionsSucceeded: 8,
        actionsFailed: 2,
        xpGained: { Mining: 15, Woodcutting: 0 },
        itemsCollected: { iron_ore: 5, copper_ore: 3 },
        learningsCount: 6,
      }

      writer.writeSummary(stats)

      const tracePath = join(testDir, RULES_VERSION, "test-seed-123", "trace.txt")
      const content = readFileSync(tracePath, "utf-8")
      expect(content).toContain("SESSION SUMMARY")
      expect(content).toContain("Actions: 10 attempted")
      expect(content).toContain("8 succeeded")
    })

    it("should write knowledge file", () => {
      writer.writeHeader()

      const knowledge = {
        world: ["TOWN is a hub location", "OUTSKIRTS_MINE has ore nodes"],
        mechanics: ["Gathering costs 5 ticks", "FOCUS mode extracts one material"],
        items: ["iron_ore can be gathered from ore nodes"],
        strategies: ["Enrol in skills before trying to gather"],
      }

      writer.writeKnowledge(knowledge)

      const knowledgePath = join(testDir, RULES_VERSION, "test-seed-123", "knowledge.txt")
      expect(existsSync(knowledgePath)).toBe(true)

      const content = readFileSync(knowledgePath, "utf-8")
      expect(content).toContain("WORLD")
      expect(content).toContain("TOWN is a hub location")
      expect(content).toContain("MECHANICS")
      expect(content).toContain("STRATEGIES")
    })
  })
})
