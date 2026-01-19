import { describe, it, expect } from "@jest/globals"
import { render } from "preact-render-to-string"
import { Contracts } from "./Contracts"
import type { ContractInfo, SkillInfo } from "../../../session/types"

describe("Contracts component", () => {
  const mockSkills: SkillInfo[] = [
    {
      id: "Mining",
      name: "Mining",
      level: 2,
      xp: 50,
      xpToNextLevel: 100,
      reputation: 0,
      reputationToNextLevel: 50,
    },
  ]

  describe("active contracts", () => {
    it("shows turn-in location when contract is complete", () => {
      const contracts: ContractInfo[] = [
        {
          id: "contract-1" as ContractInfo["id"],
          level: 1,
          guildType: "Mining",
          requirements: [{ itemId: "STONE", quantity: 5, currentQuantity: 5 }],
          rewards: { xp: 10, reputation: 5, items: [] },
          isActive: true,
          isComplete: true,
          acceptLocationId: "loc-miners-guild",
          acceptLocationName: "Miners Guild",
        },
      ]

      const html = render(<Contracts contracts={contracts} skills={mockSkills} />)

      expect(html).toContain("Ready!")
      expect(html).toContain("Turn in at Miners Guild")
    })

    it("does not show turn-in location when contract is not complete", () => {
      const contracts: ContractInfo[] = [
        {
          id: "contract-1" as ContractInfo["id"],
          level: 1,
          guildType: "Mining",
          requirements: [{ itemId: "STONE", quantity: 5, currentQuantity: 2 }],
          rewards: { xp: 10, reputation: 5, items: [] },
          isActive: true,
          isComplete: false,
          acceptLocationId: "loc-miners-guild",
          acceptLocationName: "Miners Guild",
        },
      ]

      const html = render(<Contracts contracts={contracts} skills={mockSkills} />)

      expect(html).not.toContain("Ready!")
      expect(html).not.toContain("Turn in at")
    })
  })
})
