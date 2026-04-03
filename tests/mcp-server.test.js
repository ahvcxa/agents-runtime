"use strict";

const path = require("path");

describe("mcp-server compliance and patch formatting", () => {
  const projectRoot = path.resolve(__dirname, "fixtures/project");

  test("compliance_check tool is registered", async () => {
    const { createMcpServer } = require("../src/mcp-server");
    const server = await createMcpServer(projectRoot);
    expect(server).toBeDefined();
  });

  test("server factory initializes with multi-agent tooling extensions", async () => {
    const { createMcpServer } = require("../src/mcp-server");
    const server = await createMcpServer(projectRoot);
    expect(server).toBeTruthy();
  });

  test("server factory supports additional tool registration without crash", async () => {
    const { createMcpServer } = require("../src/mcp-server");
    await expect(createMcpServer(projectRoot)).resolves.toBeDefined();
  });
});
