import { useState } from "preact/hooks"
import { useGameState, loadSavedGames, deleteSavedGame, type SaveEntry } from "./hooks/useGameState"
import { ActionHistory } from "./components/ActionHistory"
import { CommandInput } from "./components/CommandInput"
import { ValidActions } from "./components/ValidActions"
import { Sidebar } from "./components/Sidebar"

export function App() {
  const [showSaveList, setShowSaveList] = useState(false)
  const [saveListVersion, setSaveListVersion] = useState(0)
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
    const savedGames = loadSavedGames()

    if (showSaveList) {
      return (
        <div class="app start">
          <h1>Load Game</h1>
          <div class="save-list" key={saveListVersion}>
            {savedGames.length === 0 ? (
              <p class="no-saves">No saved games found</p>
            ) : (
              savedGames.map((save: SaveEntry) => (
                <div key={save.metadata.seed} class="save-entry-container">
                  <button
                    class="save-entry"
                    onClick={() => {
                      loadGame(save.savedState)
                      setShowSaveList(false)
                    }}
                  >
                    <div class="save-header">
                      <span class="save-seed">{save.metadata.seed}</span>
                      <span class="save-date">
                        {new Date(save.metadata.savedAt).toLocaleDateString()}{" "}
                        {new Date(save.metadata.savedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div class="save-stats">
                      <span>Tick: {save.metadata.currentTick}</span>
                      <span>Gold: {save.metadata.gold}</span>
                      <span>Rep: {save.metadata.guildReputation}</span>
                    </div>
                    <div class="save-skills">
                      {Object.entries(save.metadata.skills)
                        .filter(([, level]) => level > 0)
                        .map(([skill, level]) => (
                          <span key={skill} class="skill-badge">
                            {skill}: {level}
                          </span>
                        ))}
                      {Object.values(save.metadata.skills).every((level) => level === 0) && (
                        <span class="skill-badge">No skills</span>
                      )}
                    </div>
                  </button>
                  <button
                    class="delete-save-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSavedGame(save.metadata.seed)
                      setSaveListVersion((v) => v + 1)
                    }}
                    title="Delete save"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
          <button class="back-button" onClick={() => setShowSaveList(false)}>
            Back
          </button>
        </div>
      )
    }

    return (
      <div class="app start">
        <h1>Grind</h1>
        <p>A rules-first simulation game</p>
        <div class="start-buttons">
          <button onClick={() => startNewGame()}>New Game</button>
          {savedGames.length > 0 && <button onClick={() => setShowSaveList(true)}>Load</button>}
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
