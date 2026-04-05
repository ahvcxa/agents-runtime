"use strict";

class BaseExporter {
  constructor(config = {}, logger = null) {
    this.config = config;
    this.logger = logger;
  }

  async exportTrace(_traceReport) {
    throw new Error("BaseExporter.exportTrace() must be implemented");
  }
}

class NoopExporter extends BaseExporter {
  async exportTrace(_traceReport) {
    return { ok: true, exporter: "noop" };
  }
}

class LangSmithExporter extends BaseExporter {
  async exportTrace(traceReport) {
    this.logger?.log?.({
      event_type: "INFO",
      message: "LangSmith exporter placeholder",
      trace_id: traceReport?.trace_id,
    });
    return { ok: true, exporter: "langsmith", queued: true };
  }
}

class PhoenixExporter extends BaseExporter {
  async exportTrace(traceReport) {
    this.logger?.log?.({
      event_type: "INFO",
      message: "Phoenix exporter placeholder",
      trace_id: traceReport?.trace_id,
    });
    return { ok: true, exporter: "phoenix", queued: true };
  }
}

class HeliconeExporter extends BaseExporter {
  async exportTrace(traceReport) {
    this.logger?.log?.({
      event_type: "INFO",
      message: "Helicone exporter placeholder",
      trace_id: traceReport?.trace_id,
    });
    return { ok: true, exporter: "helicone", queued: true };
  }
}

function createExporter(settings = {}, logger = null) {
  const cfg = settings?.runtime?.observability ?? {};
  const provider = String(cfg.exporter || "noop").toLowerCase();

  if (provider === "langsmith") return new LangSmithExporter(cfg, logger);
  if (provider === "phoenix") return new PhoenixExporter(cfg, logger);
  if (provider === "helicone") return new HeliconeExporter(cfg, logger);
  return new NoopExporter(cfg, logger);
}

module.exports = {
  createExporter,
  BaseExporter,
  NoopExporter,
  LangSmithExporter,
  PhoenixExporter,
  HeliconeExporter,
};
