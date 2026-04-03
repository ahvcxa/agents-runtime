"use strict";

const { executeInSandbox } = require("../src/sandbox/executor");

describe("sandbox executor", () => {
  test("executes in process mode", async () => {
    const result = await executeInSandbox({ strategy: "process", timeoutMs: 1000, run: () => 42 });
    expect(result).toBe(42);
  });

  test("falls back for docker mode", async () => {
    const logger = { log() {} };
    const result = await executeInSandbox({
      strategy: "docker",
      timeoutMs: 1000,
      logger,
      sandboxSettings: { docker_enabled: false },
      run: () => "ok",
    });
    expect(result).toBe("ok");
  });

  test("times out long operations", async () => {
    await expect(
      executeInSandbox({
        strategy: "process",
        timeoutMs: 10,
        run: () => new Promise((resolve) => setTimeout(() => resolve("late"), 50)),
      })
    ).rejects.toThrow(/timeout/i);
  });
});
