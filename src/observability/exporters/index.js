"use strict";

class BaseExporter {
  constructor(config = {}, logger = null) {
    this.config = config;
    this.logger = logger;
  }

  async exportTrace(_traceReport) {
    throw new Error("BaseExporter.exportTrace() must be implemented");
  }

  async _postJson(url, payload, headers = {}) {
    if (!url) {
      return { ok: true, skipped: true, reason: "no endpoint configured" };
    }

    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(this.config?.timeout_ms ?? 5000));
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      return {
        ok: res.ok,
        status: res.status,
        status_text: res.statusText,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

class NoopExporter extends BaseExporter {
  async exportTrace(_traceReport) {
    return { ok: true, exporter: "noop" };
  }
}

class LangSmithExporter extends BaseExporter {
  async exportTrace(traceReport) {
    const headers = {};
    if (this.config?.api_key) headers["x-api-key"] = this.config.api_key;
    const payload = {
      run_id: traceReport?.trace_id,
      name: "agents-runtime-trace",
      run_type: "chain",
      extra: {
        step_count: traceReport?.step_count,
        total_latency_ms: traceReport?.total_latency_ms,
        token_usage: traceReport?.token_usage,
      },
      events: traceReport?.steps ?? [],
    };
    const result = await this._postJson(this.config?.endpoint, {
      ...payload,
      source: "agents-runtime",
    }, headers);
    return { exporter: "langsmith", ...result };
  }
}

class PhoenixExporter extends BaseExporter {
  async exportTrace(traceReport) {
    const headers = {};
    if (this.config?.api_key) headers["authorization"] = `Bearer ${this.config.api_key}`;
    const payload = {
      trace_id: traceReport?.trace_id,
      spans: (traceReport?.steps ?? []).map((step) => ({
        name: step.phase,
        attributes: {
          agent_id: step.agent_id,
          skill_id: step.skill_id,
          latency_ms: step.latency_ms,
        },
        timestamp: step.timestamp,
      })),
      metrics: {
        total_latency_ms: traceReport?.total_latency_ms,
        token_usage: traceReport?.token_usage,
      },
    };
    const result = await this._postJson(this.config?.endpoint, {
      ...payload,
      source: "agents-runtime",
    }, headers);
    return { exporter: "phoenix", ...result };
  }
}

class HeliconeExporter extends BaseExporter {
  async exportTrace(traceReport) {
    const headers = {};
    if (this.config?.api_key) headers["helicone-auth"] = `Bearer ${this.config.api_key}`;
    const payload = {
      trace_id: traceReport?.trace_id,
      model: this.config?.model || "agents-runtime",
      latency_ms: traceReport?.total_latency_ms,
      usage: traceReport?.token_usage,
      metadata: {
        source: "agents-runtime",
        steps: traceReport?.step_count,
      },
      events: traceReport?.steps ?? [],
    };
    const result = await this._postJson(this.config?.endpoint, {
      ...payload,
      source: "agents-runtime",
    }, headers);
    return { exporter: "helicone", ...result };
  }
}

function createExporter(settings = {}, logger = null) {
  const cfg = settings?.runtime?.observability ?? {};
  const provider = String(cfg.exporter || "noop").toLowerCase();
  const providerCfg = {
    ...cfg,
    ...(cfg.exporters?.[provider] || {}),
  };

  if (provider === "langsmith") return new LangSmithExporter(providerCfg, logger);
  if (provider === "phoenix") return new PhoenixExporter(providerCfg, logger);
  if (provider === "helicone") return new HeliconeExporter(providerCfg, logger);
  return new NoopExporter(providerCfg, logger);
}

module.exports = {
  createExporter,
  BaseExporter,
  NoopExporter,
  LangSmithExporter,
  PhoenixExporter,
  HeliconeExporter,
};
