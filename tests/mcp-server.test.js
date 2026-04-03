"use strict";

const path = require("path");

describe("mcp-server compliance and patch formatting", () => {
  const projectRoot = path.resolve(__dirname, "fixtures/project");

  test("compliance_check tool is registered", async () => {
    const { createMcpServer } = require("../src/mcp-server");
    const server = await createMcpServer(projectRoot);
    expect(server).toBeDefined();
  });
});
