import type { JSX } from "preact"
import { useState, useCallback, useRef, useEffect } from "preact/hooks"

interface CommandInputProps {
  onSubmit: (command: string) => void
  disabled?: boolean
}

export function CommandInput({ onSubmit, disabled = false }: CommandInputProps) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Refocus input when command execution completes (disabled becomes false)
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus()
    }
  }, [disabled])

  const handleSubmit = useCallback(
    (e: JSX.TargetedEvent) => {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed && !disabled) {
        onSubmit(trimmed)
        setValue("")
        // Refocus immediately after submission
        inputRef.current?.focus()
      }
    },
    [value, onSubmit, disabled]
  )

  const handleKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        const trimmed = value.trim()
        if (trimmed && !disabled) {
          onSubmit(trimmed)
          setValue("")
          // Refocus immediately after submission
          inputRef.current?.focus()
        }
      }
    },
    [value, onSubmit, disabled]
  )

  return (
    <form class="command-input" onSubmit={handleSubmit}>
      <span class="prompt">&gt;</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Executing..." : "Type a command..."}
        disabled={disabled}
        autoFocus
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  )
}
