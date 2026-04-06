"use strict";

const { SandboxManager } = require("../src/sandbox/sandbox-manager");

// Increase timeout for SandboxManager tests (initialization can be slow)
jest.setTimeout(15000);

describe("SandboxManager", () => {
  test("health is healthy in process mode", async () => {
    const manager = new SandboxManager({ runtime: { sandbox: { strategy: "process" } } });
    await manager.init();
    const health = await manager.healthCheck();
    expect(health.status).toBe("healthy");
  });

  test("health is offline in e2b mode without API key", async () => {
    const manager = new SandboxManager({ runtime: { sandbox: { strategy: "e2b" } } });
    await manager.init();
    const health = await manager.healthCheck();
    expect(health.status).toMatch(/offline|degraded/);
  });

  test("executes run callback through manager", async () => {
    const manager = new SandboxManager({ runtime: { sandbox: { strategy: "process" } } });
    await manager.init();
    const value = await manager.execute({
      timeoutMs: 1000,
      run: () => "ok",
    });
    expect(value).toBe("ok");
  });
});
