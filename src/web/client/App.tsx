import { useGameState } from "./hooks/useGameState"

export function App() {
  const { state, validActions, isConnected, error, sendCommand, startNewGame } = useGameState()

  if (!isConnected) {
    return (
      <div class="app loading">
        <p>Connecting to server...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div class="app error">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  if (!state) {
    return (
      <div class="app start">
        <h1>Grind</h1>
        <p>A rules-first simulation game</p>
        <button onClick={() => startNewGame()}>Start New Game</button>
      </div>
    )
  }

  return (
    <div class="app game">
      <header>
        <h1>Grind</h1>
        <div class="status">
          <span>Location: {state.location.locationName}</span>
          <span>Area: {state.location.areaName}</span>
          <span>Gold: {state.gold}</span>
          <span>Tick: {state.time.currentTick}</span>
        </div>
      </header>

      <main>
        <section class="main-content">
          <div class="inventory">
            <h2>
              Inventory ({state.inventory.used}/{state.inventory.capacity})
            </h2>
            <ul>
              {state.inventory.items.map((item) => (
                <li key={item.itemId}>
                  {item.itemId}: {item.quantity}
                </li>
              ))}
              {state.inventory.items.length === 0 && <li>Empty</li>}
            </ul>
          </div>

          <div class="skills">
            <h2>Skills</h2>
            <ul>
              {state.skills.map((skill) => (
                <li key={skill.id}>
                  {skill.id}: Lv{skill.level} ({skill.xp}/{skill.xpToNextLevel} XP)
                </li>
              ))}
            </ul>
          </div>

          <div class="contracts">
            <h2>Contracts</h2>
            <ul>
              {state.contracts.map((contract) => (
                <li key={contract.id}>
                  {contract.id} (Lv{contract.level}){contract.isActive && " [ACTIVE]"}
                  {contract.isComplete && " [COMPLETE]"}
                </li>
              ))}
              {state.contracts.length === 0 && <li>None available</li>}
            </ul>
          </div>
        </section>

        <section class="actions">
          <h2>Actions</h2>
          <div class="action-buttons">
            {validActions.map((action) => (
              <button
                key={action.command}
                onClick={() => sendCommand(action.command)}
                title={`${action.displayName} (${action.timeCost} ticks)`}
              >
                {action.displayName}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
