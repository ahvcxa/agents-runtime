"use strict";

const {
  createExporter,
  NoopExporter,
  LangSmithExporter,
  PhoenixExporter,
  HeliconeExporter,
} = require("../src/observability/exporters");

describe("observability exporters", () => {
  test("createExporter returns noop by default", () => {
    const exp = createExporter({ runtime: { observability: {} } });
    expect(exp).toBeInstanceOf(NoopExporter);
  });

  test("createExporter selects provider by config", () => {
    expect(createExporter({ runtime: { observability: { exporter: "langsmith" } } })).toBeInstanceOf(LangSmithExporter);
    expect(createExporter({ runtime: { observability: { exporter: "phoenix" } } })).toBeInstanceOf(PhoenixExporter);
    expect(createExporter({ runtime: { observability: { exporter: "helicone" } } })).toBeInstanceOf(HeliconeExporter);
  });

  test("network exporters skip when endpoint is missing", async () => {
    const exp = createExporter({ runtime: { observability: { exporter: "langsmith" } } });
    const out = await exp.exportTrace({ trace_id: "t1" });
    expect(out.ok).toBe(true);
    expect(out.skipped).toBe(true);
  });
});
