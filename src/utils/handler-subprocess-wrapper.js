#!/usr/bin/env node
/**
 * src/utils/handler-subprocess-wrapper.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper for executing skill handlers in a subprocess.
 * This allows handlers to work in ESM projects by running in a separate Node process
 * where require() works normally.
 *
 * Usage:
 *   node handler-subprocess-wrapper.js <handler-path> <context-json>
 */

const path = require("path");
const handlerPath = process.argv[2];
const contextJson = process.argv[3];

if (!handlerPath || !contextJson) {
  console.error("Usage: node handler-subprocess-wrapper.js <handler-path> <context-json>");
  process.exit(1);
}

let handler;
try {
  handler = require(handlerPath);
} catch (err) {
  console.error(JSON.stringify({
    error: `Failed to load handler: ${err.message}`,
    stack: err.stack,
  }));
  process.exit(1);
}

const context = JSON.parse(contextJson);
const fn = handler.execute ?? handler.run ?? handler.default ?? handler;

if (typeof fn !== "function") {
  console.error(JSON.stringify({
    error: "Handler export is not a function",
  }));
  process.exit(1);
}

// Mock memory and log for subprocess execution
const memory = {
  get: () => null,
  set: () => {},
};

const log = (event) => {
  // Subprocess can log to stderr if needed, but main process captures stdout
};

Promise.resolve()
  .then(() => fn({ ...context, memory, log }))
  .then((result) => {
    console.log(JSON.stringify(result || {}));
    process.exit(0);
  })
  .catch((err) => {
    console.error(JSON.stringify({
      error: err.message,
      stack: err.stack,
    }));
    process.exit(1);
  });
