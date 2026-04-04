"use strict";
/**
 * src/executors/executor-factory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Factory that selects the correct executor for a given skill manifest.
 */

const { HandlerExecutor } = require("./handler-executor");
const { EchoExecutor }    = require("./echo-executor");

class ExecutorFactory {
  /**
   * Return the appropriate executor for the given skill.
   * @param {object} skillManifest
   * @param {object} options - { runtime, projectRoot, logger, settings }
   * @returns {BaseExecutor}
   */
  static for(skillManifest, options) {
    if (HandlerExecutor.canHandle(skillManifest, options.projectRoot)) {
      return new HandlerExecutor(options);
    }
    return new EchoExecutor(options);
  }
}

module.exports = { ExecutorFactory };
