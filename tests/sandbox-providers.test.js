"use strict";

const {
  createSandboxProvider,
  normalizeStrategy,
  ProcessSandboxProvider,
  DockerSandboxProvider,
  E2BSandboxProvider,
} = require("../src/sandbox/providers");

describe("sandbox provider registry", () => {
  test("normalizeStrategy trims and lowercases", () => {
    expect(normalizeStrategy(" Docker ")).toBe("docker");
  });

  test("factory returns provider types", () => {
    expect(createSandboxProvider("process", {}, null)).toBeInstanceOf(ProcessSandboxProvider);
    expect(createSandboxProvider("docker", {}, null)).toBeInstanceOf(DockerSandboxProvider);
    expect(createSandboxProvider("e2b", {}, null)).toBeInstanceOf(E2BSandboxProvider);
  });

  test("unknown strategy falls back to process provider", () => {
    const provider = createSandboxProvider("unknown", {}, null);
    expect(provider).toBeInstanceOf(ProcessSandboxProvider);
  });
});
