"use strict";

const { randomUUID } = require("crypto");

function createTracer(serviceName = "agents-runtime") {
  try {
    const api = require("@opentelemetry/api");
    const tracer = api.trace.getTracer(serviceName);
    return {
      traceId() {
        return randomUUID();
      },
      startSpan(name, attrs = {}) {
        const span = tracer.startSpan(name);
        Object.entries(attrs).forEach(([k, v]) => span.setAttribute(k, v));
        return span;
      },
      withSpan(span, fn) {
        return fn();
      },
    };
  } catch {
    return {
      traceId() {
        return randomUUID();
      },
      startSpan(_name, _attrs = {}) {
        return {
          setAttribute() {},
          recordException() {},
          setStatus() {},
          end() {},
        };
      },
      withSpan(_span, fn) {
        return fn();
      },
    };
  }
}

module.exports = { createTracer };
