"use strict";

const path = require("path");
const { createRuntime } = require("../src/engine");

describe("v2 smoke: external MCP -> sandbox -> memory pipeline", () => {
  const projectRoot = path.resolve(__dirname, "fixtures/project");

  test("completes pipeline and persists long-term memory", async () => {
    jest.setTimeout(15000);
    const rt = await createRuntime({ projectRoot, verbosity: "silent", autoDiscoverAgent: false });
    try {
      // Mock external MCP dependency to keep test deterministic
      rt.callExternalMcpTool = async () => ({
        ok: true,
        structured_content: {
          tickets: [
            { id: "INC-1", status: "open" },
            { id: "INC-2", status: "closed" },
          ],
        },
      });

      // Use deterministic trace id
      rt.tracer.traceId = () => "trace-smoke-1";

      const out = await rt.runMcpSandboxMemoryPipeline({
        agent_id: "smoke-agent",
        tool_name: "fake_tickets",
        tool_input: { project: "demo" },
        query: "open incidents",
        sandbox_mode: "summarize",
        memory_key: "smoke:pipeline:1",
      });

      expect(out.success).toBe(true);
      expect(out.memory_key).toBe("smoke:pipeline:1");
      expect(out.trace_id).toBe("trace-smoke-1");

      const stored = await rt.retrieveLongTerm("smoke:pipeline:1");
      expect(stored).toBeDefined();
      expect(stored.value.tool_name).toBe("fake_tickets");
      expect(stored.value.trace_id).toBe("trace-smoke-1");
    } finally {
      await rt.shutdown();
    }
  });
});
