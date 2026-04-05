"use strict";

const {
  createExporter,
  NoopExporter,
  LangSmithExporter,
  PhoenixExporter,
  HeliconeExporter,
} = require("../src/observability/exporters");

describe("observability exporters", () => {
  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) {
      global.fetch.mockRestore();
    }
  });

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

  test("provider-specific nested config is used for endpoint/auth", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });

    const exp = createExporter({
      runtime: {
        observability: {
          exporter: "langsmith",
          timeout_ms: 2000,
          exporters: {
            langsmith: {
              endpoint: "https://example.com/langsmith/ingest",
              api_key: "demo-key",
            },
          },
        },
      },
    });

    const out = await exp.exportTrace({ trace_id: "t2", step_count: 1, steps: [] });
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-api-key"]).toBe("demo-key");
  });
});
