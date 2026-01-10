import { describe, it, expect, beforeEach } from "@jest/globals"
import {
  buildAreaNamingPrompt,
  generateAreaName,
  getNeighborNames,
  AnthropicMessagesClient,
} from "./areaNaming.js"
import type { Area, ExplorationLocation, AreaConnection } from "./types.js"
import { ExplorationLocationType } from "./types.js"

describe("Area Naming", () => {
  describe("buildAreaNamingPrompt", () => {
    it("should include distance from town in the prompt", () => {
      const area: Area = {
        id: "area-d2-i0",
        distance: 2,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt).toContain("distance 2")
      expect(prompt).toContain("town")
    })

    it("should indicate safety for close areas (distance 1)", () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt.toLowerCase()).toMatch(/safe|peaceful|settled|close/)
    })

    it("should indicate danger for far areas (distance 3+)", () => {
      const area: Area = {
        id: "area-d3-i0",
        distance: 3,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt.toLowerCase()).toMatch(/danger|wild|remote|frontier/)
    })

    it("should include gathering node information", () => {
      const miningLocation: ExplorationLocation = {
        id: "loc-1",
        areaId: "area-d1-i0",
        type: ExplorationLocationType.GATHERING_NODE,
        gatheringSkillType: "Mining",
      }
      const woodcuttingLocation: ExplorationLocation = {
        id: "loc-2",
        areaId: "area-d1-i0",
        type: ExplorationLocationType.GATHERING_NODE,
        gatheringSkillType: "Woodcutting",
      }

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [miningLocation, woodcuttingLocation],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt.toLowerCase()).toMatch(/mining|ore|mineral/)
      expect(prompt.toLowerCase()).toMatch(/woodcutting|tree|forest|lumber/)
    })

    it("should include mob camp information", () => {
      const mobCamp: ExplorationLocation = {
        id: "loc-1",
        areaId: "area-d2-i0",
        type: ExplorationLocationType.MOB_CAMP,
        creatureType: "goblin",
        difficulty: 2,
      }

      const area: Area = {
        id: "area-d2-i0",
        distance: 2,
        generated: true,
        locations: [mobCamp],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt.toLowerCase()).toMatch(/mob|creature|monster|camp|hostile/)
    })

    it("should include neighbor area names when provided", () => {
      const area: Area = {
        id: "area-d2-i0",
        distance: 2,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const neighborNames = ["Whispering Hollow", "The Iron Ridge"]
      const prompt = buildAreaNamingPrompt(area, neighborNames)

      expect(prompt).toContain("Whispering Hollow")
      expect(prompt).toContain("The Iron Ridge")
    })

    it("should handle areas with no locations gracefully", () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      // Should still produce a valid prompt
      expect(prompt.length).toBeGreaterThan(50)
      expect(prompt).toContain("distance 1")
    })

    it("should handle areas with no neighbor names gracefully", () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      // Should still produce a valid prompt without crashing
      expect(prompt.length).toBeGreaterThan(50)
    })

    it("should request short 1-3 word names", () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt.toLowerCase()).toMatch(/short|1-3 word|brief|concise/)
    })

    it("should request evocative place-style names", () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [])

      expect(prompt.toLowerCase()).toMatch(/place|location|name|evocative/)
    })

    it("should include exclude names when provided", () => {
      const area: Area = {
        id: "area-d2-i0",
        distance: 2,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const excludeNames = ["Slate Ridge", "Iron Valley"]
      const prompt = buildAreaNamingPrompt(area, [], excludeNames)

      expect(prompt).toContain("Slate Ridge")
      expect(prompt).toContain("Iron Valley")
      expect(prompt.toLowerCase()).toMatch(/don't use|already taken|avoid/)
    })

    it("should not include exclusion section when no exclude names", () => {
      const area: Area = {
        id: "area-d2-i0",
        distance: 2,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const prompt = buildAreaNamingPrompt(area, [], [])

      expect(prompt.toLowerCase()).not.toMatch(/don't use|already taken/)
    })
  })

  describe("getNeighborNames", () => {
    it("should return names of connected areas that have names", () => {
      const areas = new Map<string, Area>([
        [
          "area-d1-i0",
          {
            id: "area-d1-i0",
            name: "Whispering Hollow",
            distance: 1,
            generated: true,
            locations: [],
            indexInDistance: 0,
          },
        ],
        [
          "area-d1-i1",
          {
            id: "area-d1-i1",
            name: "The Iron Ridge",
            distance: 1,
            generated: true,
            locations: [],
            indexInDistance: 1,
          },
        ],
        [
          "area-d1-i2",
          {
            id: "area-d1-i2",
            distance: 1,
            generated: true,
            locations: [],
            indexInDistance: 2,
          },
        ],
        [
          "area-d2-i0",
          {
            id: "area-d2-i0",
            distance: 2,
            generated: true,
            locations: [],
            indexInDistance: 0,
          },
        ],
      ])

      const connections: AreaConnection[] = [
        { fromAreaId: "area-d2-i0", toAreaId: "area-d1-i0", travelTimeMultiplier: 2 },
        { fromAreaId: "area-d2-i0", toAreaId: "area-d1-i1", travelTimeMultiplier: 2 },
        { fromAreaId: "area-d2-i0", toAreaId: "area-d1-i2", travelTimeMultiplier: 2 },
      ]

      const targetArea = areas.get("area-d2-i0")!
      const names = getNeighborNames(targetArea, areas, connections)

      expect(names).toContain("Whispering Hollow")
      expect(names).toContain("The Iron Ridge")
      expect(names).toHaveLength(2) // area-d1-i2 has no name
    })

    it("should return empty array when no neighbors have names", () => {
      const areas = new Map<string, Area>([
        [
          "area-d1-i0",
          {
            id: "area-d1-i0",
            distance: 1,
            generated: true,
            locations: [],
            indexInDistance: 0,
          },
        ],
        [
          "area-d2-i0",
          {
            id: "area-d2-i0",
            distance: 2,
            generated: true,
            locations: [],
            indexInDistance: 0,
          },
        ],
      ])

      const connections: AreaConnection[] = [
        { fromAreaId: "area-d2-i0", toAreaId: "area-d1-i0", travelTimeMultiplier: 2 },
      ]

      const targetArea = areas.get("area-d2-i0")!
      const names = getNeighborNames(targetArea, areas, connections)

      expect(names).toHaveLength(0)
    })

    it("should handle areas with no connections", () => {
      const areas = new Map<string, Area>([
        [
          "area-d1-i0",
          {
            id: "area-d1-i0",
            distance: 1,
            generated: true,
            locations: [],
            indexInDistance: 0,
          },
        ],
      ])

      const connections: AreaConnection[] = []

      const targetArea = areas.get("area-d1-i0")!
      const names = getNeighborNames(targetArea, areas, connections)

      expect(names).toHaveLength(0)
    })
  })

  describe("generateAreaName", () => {
    let mockClient: AnthropicMessagesClient
    let createCallArgs: unknown[]

    beforeEach(() => {
      createCallArgs = []
      mockClient = {
        create: async (params) => {
          createCallArgs.push(params)
          return { content: [{ type: "text", text: "Thornwood Vale" }] }
        },
      }
    })

    it("should call Anthropic API and return the generated name", async () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const name = await generateAreaName(area, [], [], "test-api-key", mockClient)

      expect(name).toBe("Thornwood Vale")
      expect(createCallArgs).toHaveLength(1)
    })

    it("should trim whitespace from the response", async () => {
      mockClient.create = async () => ({
        content: [{ type: "text", text: "  The Scarred Basin  \n" }],
      })

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const name = await generateAreaName(area, [], [], "test-api-key", mockClient)

      expect(name).toBe("The Scarred Basin")
    })

    it("should pass neighbor names to the prompt", async () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const neighborNames = ["Whispering Hollow", "The Iron Ridge"]
      await generateAreaName(area, neighborNames, [], "test-api-key", mockClient)

      // Check that the prompt contains neighbor names
      const callArgs = createCallArgs[0] as { messages: Array<{ content: string }> }
      const userMessage = callArgs.messages[0].content
      expect(userMessage).toContain("Whispering Hollow")
      expect(userMessage).toContain("The Iron Ridge")
    })

    it("should return fallback name if API returns empty response", async () => {
      mockClient.create = async () => ({
        content: [{ type: "text", text: "" }],
      })

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const name = await generateAreaName(area, [], [], "test-api-key", mockClient)

      // Should return a fallback based on area ID
      expect(name).toBe("Unnamed Wilds")
    })

    it("should return fallback name if API call fails", async () => {
      mockClient.create = async () => {
        throw new Error("API Error")
      }

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const name = await generateAreaName(area, [], [], "test-api-key", mockClient)

      expect(name).toBe("Unnamed Wilds")
    })

    it("should use a small, fast model for naming", async () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      await generateAreaName(area, [], [], "test-api-key", mockClient)

      const callArgs = createCallArgs[0] as { model: string }
      // Should use haiku for speed/cost efficiency
      expect(callArgs.model).toMatch(/haiku/)
    })

    it("should set low max_tokens since we only need a short name", async () => {
      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      await generateAreaName(area, [], [], "test-api-key", mockClient)

      const callArgs = createCallArgs[0] as { max_tokens: number }
      expect(callArgs.max_tokens).toBeLessThanOrEqual(50)
    })

    it("should return undefined when no API key and no client is provided", async () => {
      // Ensure env var is not set for this test
      const originalEnv = process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      try {
        const area: Area = {
          id: "area-d1-i0",
          distance: 1,
          generated: true,
          locations: [],
          indexInDistance: 0,
        }

        // Call without API key and without mock client
        const name = await generateAreaName(area, [])

        expect(name).toBeUndefined()
      } finally {
        if (originalEnv) {
          process.env.ANTHROPIC_API_KEY = originalEnv
        }
      }
    })

    it("should retry when generated name is a duplicate", async () => {
      const callCount = { value: 0 }
      mockClient.create = async () => {
        callCount.value++
        // First call returns a duplicate, second returns unique
        if (callCount.value === 1) {
          return { content: [{ type: "text", text: "Duplicate Name" }] }
        }
        return { content: [{ type: "text", text: "Unique Name" }] }
      }

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const existingNames = ["Duplicate Name", "Another Name"]
      const name = await generateAreaName(area, [], existingNames, "test-api-key", mockClient)

      expect(name).toBe("Unique Name")
      expect(callCount.value).toBe(2)
    })

    it("should include duplicate name in exclusion list on retry", async () => {
      const calls: string[] = []
      mockClient.create = async (params) => {
        calls.push(params.messages[0].content)
        if (calls.length === 1) {
          return { content: [{ type: "text", text: "Duplicate Name" }] }
        }
        return { content: [{ type: "text", text: "Unique Name" }] }
      }

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const existingNames = ["Duplicate Name"]
      await generateAreaName(area, [], existingNames, "test-api-key", mockClient)

      // Second call should include "Duplicate Name" in exclusion list
      expect(calls[1]).toContain("Duplicate Name")
      expect(calls[1].toLowerCase()).toMatch(/don't use|already taken/)
    })

    it("should return fallback after max retries with duplicates", async () => {
      // Always return a duplicate name
      mockClient.create = async () => ({
        content: [{ type: "text", text: "Always Duplicate" }],
      })

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const existingNames = ["Always Duplicate"]
      const name = await generateAreaName(area, [], existingNames, "test-api-key", mockClient)

      // Should fall back after exhausting retries
      expect(name).toBe("Unnamed Wilds")
    })

    it("should accept unique name immediately without retrying", async () => {
      const callCount = { value: 0 }
      mockClient.create = async () => {
        callCount.value++
        return { content: [{ type: "text", text: "Unique Name" }] }
      }

      const area: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }

      const existingNames = ["Different Name", "Another Name"]
      const name = await generateAreaName(area, [], existingNames, "test-api-key", mockClient)

      expect(name).toBe("Unique Name")
      expect(callCount.value).toBe(1) // Only one call needed
    })
  })

  describe("Integration with ensureAreaFullyGenerated", () => {
    it("should set area name when ANTHROPIC_API_KEY env var is set", async () => {
      // Set env var for this test
      const originalEnv = process.env.ANTHROPIC_API_KEY
      process.env.ANTHROPIC_API_KEY = "test-key"

      try {
        // Import here to avoid circular dependency issues
        const { ensureAreaFullyGenerated } = await import("./exploration.js")
        const { createRng } = await import("./rng.js")

        const rng = createRng("test-seed")

        const areas = new Map<string, Area>([
          [
            "TOWN",
            {
              id: "TOWN",
              name: "Town",
              distance: 0,
              generated: true,
              locations: [],
              indexInDistance: 0,
            },
          ],
          [
            "area-d1-i0",
            {
              id: "area-d1-i0",
              distance: 1,
              generated: false,
              locations: [],
              indexInDistance: 0,
            },
          ],
        ])

        const exploration = {
          areas,
          connections: [
            { fromAreaId: "TOWN", toAreaId: "area-d1-i0", travelTimeMultiplier: 2 as const },
          ],
          playerState: {
            currentAreaId: "TOWN",
            currentLocationId: null,
            knownAreaIds: ["TOWN"],
            knownLocationIds: [],
            knownConnectionIds: [],
            totalLuckDelta: 0,
            currentStreak: 0,
          },
        }

        const area = areas.get("area-d1-i0")!
        await ensureAreaFullyGenerated(rng, exploration, area)

        // With API key set, should get a name (either from LLM or fallback)
        expect(area.name).toBeDefined()
      } finally {
        // Restore original env
        if (originalEnv) {
          process.env.ANTHROPIC_API_KEY = originalEnv
        } else {
          delete process.env.ANTHROPIC_API_KEY
        }
      }
    })

    it("should leave area unnamed when ANTHROPIC_API_KEY is not set", async () => {
      // Ensure env var is not set for this test
      const originalEnv = process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      try {
        const { ensureAreaFullyGenerated } = await import("./exploration.js")
        const { createRng } = await import("./rng.js")

        const rng = createRng("test-seed")

        const areas = new Map<string, Area>([
          [
            "TOWN",
            {
              id: "TOWN",
              name: "Town",
              distance: 0,
              generated: true,
              locations: [],
              indexInDistance: 0,
            },
          ],
          [
            "area-d1-i0",
            {
              id: "area-d1-i0",
              distance: 1,
              generated: false,
              locations: [],
              indexInDistance: 0,
            },
          ],
        ])

        const exploration = {
          areas,
          connections: [
            { fromAreaId: "TOWN", toAreaId: "area-d1-i0", travelTimeMultiplier: 2 as const },
          ],
          playerState: {
            currentAreaId: "TOWN",
            currentLocationId: null,
            knownAreaIds: ["TOWN"],
            knownLocationIds: [],
            knownConnectionIds: [],
            totalLuckDelta: 0,
            currentStreak: 0,
          },
        }

        const area = areas.get("area-d1-i0")!
        await ensureAreaFullyGenerated(rng, exploration, area)

        // No API key = area stays unnamed (uses distance-based display fallback)
        expect(area.name).toBeUndefined()
      } finally {
        // Restore original env
        if (originalEnv) {
          process.env.ANTHROPIC_API_KEY = originalEnv
        }
      }
    })
  })
})
