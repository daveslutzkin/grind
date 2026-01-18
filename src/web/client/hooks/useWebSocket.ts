import { useState, useEffect, useCallback, useRef } from "preact/hooks"
import type { ClientMessage, ServerMessage } from "../../server/protocol"

export interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

export interface UseWebSocketResult {
  isConnected: boolean
  send: (message: ClientMessage) => void
  error: string | null
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketResult {
  const { onMessage, reconnectDelay = 1000, maxReconnectAttempts = 5 } = options

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const getWebSocketUrl = useCallback((): string => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    // In development, Vite proxies /ws to the backend
    // In production, we connect directly to the same host
    if (import.meta.env.DEV) {
      return `${protocol}//${window.location.host}/ws`
    }
    return `${protocol}//${window.location.host}/ws`
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    const url = getWebSocketUrl()
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage
        onMessage?.(message)
      } catch {
        console.error("Failed to parse WebSocket message:", event.data)
      }
    }

    ws.onerror = () => {
      setError("WebSocket connection error")
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null

      // Attempt reconnection
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current += 1
        const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1)
        reconnectTimeoutRef.current = window.setTimeout(connect, delay)
      } else {
        setError("Failed to connect after multiple attempts")
      }
    }
  }, [getWebSocketUrl, onMessage, reconnectDelay, maxReconnectAttempts])

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn("WebSocket not connected, cannot send message")
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return { isConnected, send, error }
}
