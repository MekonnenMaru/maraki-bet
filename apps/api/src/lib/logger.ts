type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, extra?: unknown) {
  const time = new Date().toISOString();
  const line = extra === undefined ? `${time} [${level}] ${message}` : `${time} [${level}] ${message} ${safeJson(extra)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export const logger = {
  debug: (message: string, extra?: unknown) => write("debug", message, extra),
  info: (message: string, extra?: unknown) => write("info", message, extra),
  warn: (message: string, extra?: unknown) => write("warn", message, extra),
  error: (message: string, extra?: unknown) => write("error", message, extra),
};
