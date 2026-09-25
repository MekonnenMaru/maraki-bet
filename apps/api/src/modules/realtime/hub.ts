import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import type { ClientMessage, OutcomeQuoteDto, ServerMessage } from "@maraki/shared";
import { logger } from "../../lib/logger.js";
import { redisSub } from "../../lib/redis.js";
import { CHANNELS } from "../odds/odds.cache.js";

type Client = {
  socket: WebSocket;
  rooms: Set<string>;
};

export class RealtimeHub {
  private clients = new Set<Client>();

  attach(server: Server) {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (socket) => {
      const client: Client = { socket, rooms: new Set() };
      this.clients.add(client);
      send(socket, { type: "hello", rooms: [] });

      socket.on("message", (raw) => {
        let message: ClientMessage;
        try {
          message = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
          return;
        }
        if (message.type === "ping") {
          send(socket, { type: "pong" });
          return;
        }
        if (message.type === "subscribe") {
          for (const room of message.rooms) client.rooms.add(room);
          send(socket, { type: "hello", rooms: [...client.rooms] });
        }
        if (message.type === "unsubscribe") {
          for (const room of message.rooms) client.rooms.delete(room);
        }
      });

      socket.on("close", () => this.clients.delete(client));
    });
  }

  async listenRedis() {
    await redisSub.subscribe(CHANNELS.odds, CHANNELS.fixture);
    redisSub.on("message", (channel, payload) => {
      try {
        const data = JSON.parse(payload) as { fixtureId: string; quotes?: OutcomeQuoteDto[] };
        if (channel === CHANNELS.odds && data.quotes) {
          this.broadcast(roomsForFixture(data.fixtureId), {
            type: "odds",
            fixtureId: data.fixtureId,
            quotes: data.quotes,
          });
        }
      } catch (error) {
        logger.warn("Realtime redis payload ignored", {
          error: error instanceof Error ? error.message : error,
        });
      }
    });
  }

  broadcast(rooms: string[], message: ServerMessage) {
    for (const client of this.clients) {
      if (rooms.some((room) => client.rooms.has(room) || client.rooms.has("all"))) {
        send(client.socket, message);
      }
    }
  }
}

function roomsForFixture(fixtureId: string) {
  return ["all", `fixture:${fixtureId}`, "odds"];
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}
