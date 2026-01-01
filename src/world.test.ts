import { createToyWorld } from "./world.js"

describe("World", () => {
  describe("createToyWorld", () => {
    it("should create world with 20 tick session", () => {
      const state = createToyWorld("test-seed")
      expect(state.time.sessionRemainingTicks).toBe(20)
      expect(state.time.currentTick).toBe(0)
    })

    it("should start player at TOWN", () => {
      const state = createToyWorld("test-seed")
      expect(state.player.location).toBe("TOWN")
    })

    it("should have three locations", () => {
      const state = createToyWorld("test-seed")
      expect(state.world.locations).toEqual(["TOWN", "MINE", "FOREST"])
    })

    it("should have travel costs between all locations", () => {
      const state = createToyWorld("test-seed")
      expect(state.world.travelCosts["TOWN->MINE"]).toBeDefined()
      expect(state.world.travelCosts["MINE->TOWN"]).toBeDefined()
      expect(state.world.travelCosts["TOWN->FOREST"]).toBeDefined()
      expect(state.world.travelCosts["FOREST->TOWN"]).toBeDefined()
      expect(state.world.travelCosts["MINE->FOREST"]).toBeDefined()
      expect(state.world.travelCosts["FOREST->MINE"]).toBeDefined()
    })

    it("should have iron ore node at MINE", () => {
      const state = createToyWorld("test-seed")
      const ironNode = state.world.resourceNodes.find((n) => n.itemId === "IRON_ORE")
      expect(ironNode).toBeDefined()
      expect(ironNode?.location).toBe("MINE")
    })

    it("should have wood log node at FOREST", () => {
      const state = createToyWorld("test-seed")
      const woodNode = state.world.resourceNodes.find((n) => n.itemId === "WOOD_LOG")
      expect(woodNode).toBeDefined()
      expect(woodNode?.location).toBe("FOREST")
    })

    it("should have Cave Rat enemy", () => {
      const state = createToyWorld("test-seed")
      const caveRat = state.world.enemies.find((e) => e.id === "cave-rat")
      expect(caveRat).toBeDefined()
      expect(caveRat?.failureRelocation).toBe("TOWN")
    })

    it("should have iron bar recipe", () => {
      const state = createToyWorld("test-seed")
      const ironBarRecipe = state.world.recipes.find((r) => r.output.itemId === "IRON_BAR")
      expect(ironBarRecipe).toBeDefined()
      expect(ironBarRecipe?.inputs).toContainEqual({ itemId: "IRON_ORE", quantity: 2 })
    })

    it("should have Miners Guild contract", () => {
      const state = createToyWorld("test-seed")
      const contract = state.world.contracts.find((c) => c.id === "miners-guild-1")
      expect(contract).toBeDefined()
      expect(contract?.guildLocation).toBe("TOWN")
    })

    it("should initialize all skills to 1", () => {
      const state = createToyWorld("test-seed")
      expect(state.player.skills.Mining).toBe(1)
      expect(state.player.skills.Woodcutting).toBe(1)
      expect(state.player.skills.Combat).toBe(1)
      expect(state.player.skills.Smithing).toBe(1)
      expect(state.player.skills.Logistics).toBe(1)
    })

    it("should use provided seed for RNG", () => {
      const state = createToyWorld("my-custom-seed")
      expect(state.rng.seed).toBe("my-custom-seed")
      expect(state.rng.counter).toBe(0)
    })

    it("should have storage at TOWN", () => {
      const state = createToyWorld("test-seed")
      expect(state.world.storageLocation).toBe("TOWN")
    })
  })
})
