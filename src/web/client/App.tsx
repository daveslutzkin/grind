import { useGameState } from "./hooks/useGameState"
import { ActionHistory } from "./components/ActionHistory"
import { CommandInput } from "./components/CommandInput"
import { ValidActions } from "./components/ValidActions"
import { Sidebar } from "./components/Sidebar"

export function App() {
  const {
    state,
    validActions,
    isConnected,
    error,
    isExecuting,
    currentCommand,
    commandHistory,
    sendCommand,
    startNewGame,
    loadGame,
    saveGame,
  } = useGameState()

  if (!isConnected) {
    return (
      <div class="app loading">
        <div class="loading-spinner" />
        <p>Connecting to server...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div class="app error">
        <h1>Connection Error</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  if (!state) {
    const savedGame = localStorage.getItem("grind_saved_game")

    return (
      <div class="app start">
        <h1>Grind</h1>
        <p>A rules-first simulation game</p>
        <div class="start-buttons">
          <button onClick={() => startNewGame()}>New Game</button>
          {savedGame && <button onClick={() => loadGame(savedGame)}>Continue</button>}
        </div>
      </div>
    )
  }

  return (
    <div class="app game">
      <header>
        <div class="header-left">
          <h1>Grind</h1>
        </div>
        <div class="header-center">
          <span class="location">
            {state.location.locationName} ({state.location.areaName})
          </span>
        </div>
        <div class="header-right">
          <span class="stat">
            <span class="stat-label">Gold:</span> {state.gold}
          </span>
          <span class="stat">
            <span class="stat-label">Rep:</span> {state.guildReputation}
          </span>
          <span class="stat">
            <span class="stat-label">Tick:</span> {state.time.currentTick}
          </span>
          <button class="save-btn" onClick={saveGame} title="Save Game">
            Save
          </button>
        </div>
      </header>

      <div class="game-layout">
        <main class="main-panel">
          <ActionHistory history={commandHistory} currentCommand={currentCommand} />
          <div class="input-area">
            <ValidActions actions={validActions} onAction={sendCommand} disabled={isExecuting} />
            <CommandInput onSubmit={sendCommand} disabled={isExecuting} />
          </div>
        </main>

        <Sidebar state={state} />
      </div>
    </div>
  )
}
