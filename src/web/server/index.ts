/**
 * Web Server Entry Point
 *
 * Fastify server with WebSocket support for the web interface.
 */

import "dotenv/config"
import Fastify from "fastify"
import websocketPlugin from "@fastify/websocket"
import staticPlugin from "@fastify/static"
import { fileURLToPath } from "url"
import path from "path"
import { Buffer } from "node:buffer"
import { WebSocketHandler } from "./websocket.js"
import type { ServerMessage } from "./protocol.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.env.PORT ?? "5173", 10)
const HOST = process.env.HOST ?? "0.0.0.0"

async function startServer() {
  const fastify = Fastify({
    logger: true,
  })

  // Register WebSocket plugin
  await fastify.register(websocketPlugin)

  // Serve static files from the client dist folder
  const clientDistPath = path.join(__dirname, "../client/dist")
  await fastify.register(staticPlugin, {
    root: clientDistPath,
    prefix: "/",
  })

  // WebSocket route for game connection
  fastify.get("/ws", { websocket: true }, (socket) => {
    const handler = new WebSocketHandler(fastify.log)

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg))
      }
    }

    fastify.log.info("WebSocket client connected")

    socket.on("message", async (data: Buffer) => {
      try {
        await handler.handleRawMessage(data.toString(), send)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        fastify.log.error(`WebSocket error: ${message}`)
        send({ type: "error", message })
      }
    })

    socket.on("close", () => {
      fastify.log.info("WebSocket client disconnected")
    })

    socket.on("error", (error: Error) => {
      fastify.log.error(`WebSocket error: ${error.message}`)
    })
  })

  // Health check endpoint
  fastify.get("/health", async () => {
    return { status: "ok" }
  })

  try {
    await fastify.listen({ port: PORT, host: HOST })
    console.log(`Server listening on http://${HOST}:${PORT}`)
    console.log(`WebSocket available at ws://${HOST}:${PORT}/ws`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

startServer()
