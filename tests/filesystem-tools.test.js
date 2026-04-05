"use strict";

const path = require("path");
const fs = require("fs/promises");

const { createRuntime } = require("../src/engine");
const {
  resolveProjectPath,
  listProjectFiles,
  readProjectFile,
} = require("../src/mcp/filesystem-tools");

describe("mcp filesystem tools", () => {
  const projectRoot = path.resolve(__dirname, "fixtures/project");
  const sandboxDir = path.join(projectRoot, "mcp-fs-test");

  beforeEach(async () => {
    await fs.mkdir(sandboxDir, { recursive: true });
    await fs.writeFile(path.join(sandboxDir, "a.js"), "const a = 1;\nconst b = 2;\n", "utf8");
    await fs.writeFile(path.join(sandboxDir, "notes.txt"), "line-1\nline-2\nline-3\nline-4\n", "utf8");
    await fs.mkdir(path.join(sandboxDir, "nested"), { recursive: true });
    await fs.writeFile(path.join(sandboxDir, "nested", "c.js"), "module.exports = 42;\n", "utf8");
  });

  afterEach(async () => {
    await fs.rm(sandboxDir, { recursive: true, force: true });
    await fs.rm(path.join(projectRoot, ".env"), { force: true });
  });

  test("resolveProjectPath blocks traversal outside project", () => {
    expect(() => resolveProjectPath(projectRoot, "../outside.txt")).toThrow("outside project root");
  });

  test("listProjectFiles returns directory entries with recursion", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    const result = await listProjectFiles(rt, projectRoot, {
      targetPath: "mcp-fs-test",
      recursive: true,
      includeHidden: false,
      maxEntries: 100,
    });

    const paths = result.entries.map((e) => e.path);
    expect(paths).toContain("mcp-fs-test/a.js");
    expect(paths).toContain("mcp-fs-test/notes.txt");
    expect(paths).toContain("mcp-fs-test/nested");
    expect(paths).toContain("mcp-fs-test/nested/c.js");
    expect(result.skipped_count).toBe(0);
  });

  test("readProjectFile returns paginated line window", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    const result = await readProjectFile(rt, projectRoot, {
      targetPath: "mcp-fs-test/notes.txt",
      offset: 2,
      limit: 2,
    });

    expect(result.path).toBe("mcp-fs-test/notes.txt");
    expect(result.content).toContain("2: line-2");
    expect(result.content).toContain("3: line-3");
    expect(result.content).not.toContain("1: line-1");
    expect(result.truncated).toBe(true);
  });

  test("readProjectFile respects pre-read forbidden patterns", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    await fs.writeFile(path.join(projectRoot, ".env"), "SECRET=abc\n", "utf8");

    await expect(readProjectFile(rt, projectRoot, {
      targetPath: ".env",
      offset: 1,
      limit: 10,
    })).rejects.toThrow("Access denied by pre-read hook");
  });
});
