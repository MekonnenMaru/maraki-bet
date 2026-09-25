import WebSocket from "ws";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { OddsPapiWsEnvelope } from "./types.js";

type Handlers = {
  onMessage: (message: OddsPapiWsEnvelope) => void;
  onStatus: (connected: boolean, reason?: string) => void;
};

export class OddsPapiWsClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private attempts = 0;
  private cursor: { serverEpoch?: string; lastSeenId?: Record<string, string> } = {};

  constructor(private readonly handlers: Handlers) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private connect() {
    if (this.stopped) return;
    logger.info("Connecting OddsPapi WebSocket");
    const socket = new WebSocket(env.ODDSPAPI_WS_URL);
    this.socket = socket;

    const loginTimeout = setTimeout(() => {
      logger.warn("OddsPapi WebSocket login timed out");
      socket.close();
    }, 10_000);

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "login",
          apiKey: env.ODDSPAPI_API_KEY,
          receiveType: "json",
          clientName: "maraki-bet",
          channels: ["fixtures", "scores", "odds"],
          sportIds: env.SPORT_IDS,
          bookmakers: [env.SOURCE_BOOKMAKER],
          lang: env.ODDSPAPI_LANG,
          ...this.cursor,
        }),
      );
    });

    socket.on("message", (raw) => {
      const text = raw.toString();
      let message: OddsPapiWsEnvelope;
      try {
        message = JSON.parse(text) as OddsPapiWsEnvelope;
      } catch {
        logger.warn("OddsPapi WS sent non-JSON frame");
        return;
      }

      if (message.type === "login_ok") {
        clearTimeout(loginTimeout);
        this.attempts = 0;
        if (message.serverEpoch) this.cursor.serverEpoch = message.serverEpoch;
        this.handlers.onStatus(true);
        logger.info("OddsPapi WebSocket login_ok", { access: message.access });
        return;
      }

      if (message.entryId && message.channel) {
        this.cursor.lastSeenId = {
          ...this.cursor.lastSeenId,
          [message.channel]: message.entryId,
        };
      }

      this.handlers.onMessage(message);
    });

    socket.on("close", (code, reason) => {
      clearTimeout(loginTimeout);
      const why = reason.toString() || `code ${code}`;
      logger.warn("OddsPapi WebSocket closed", { why });
      this.handlers.onStatus(false, why);
      this.scheduleReconnect();
    });

    socket.on("error", (error) => {
      clearTimeout(loginTimeout);
      logger.warn("OddsPapi WebSocket error", { message: error.message });
      this.handlers.onStatus(false, error.message);
    });
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.attempts += 1;
    if (this.attempts >= 3) {
      logger.warn("OddsPapi WebSocket unavailable after 3 attempts; staying on REST snapshots");
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 20_000);
  }
}
