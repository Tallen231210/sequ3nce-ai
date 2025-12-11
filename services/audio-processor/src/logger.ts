// Simple logger utility

export function log(level: "info" | "error" | "warn" | "debug", message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log("info", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
  warn: (message: string, data?: unknown) => log("warn", message, data),
  debug: (message: string, data?: unknown) => log("debug", message, data),
};
