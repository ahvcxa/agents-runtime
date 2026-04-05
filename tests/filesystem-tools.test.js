"use strict";

const path = require("path");
const fs = require("fs/promises");

const { createRuntime } = require("../src/engine");
const {
  resolveProjectPath,
  getWriteMode,
  listProjectFiles,
  readProjectFile,
  writeProjectFile,
  applyProjectPatch,
  deleteProjectPath,
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
    await fs.rm(path.join(projectRoot, "mcp-fs-delete"), { recursive: true, force: true });
    delete process.env.MCP_WRITE_MODE;
  });

  test("getWriteMode defaults to off", () => {
    delete process.env.MCP_WRITE_MODE;
    expect(getWriteMode()).toBe("off");
  });

  test("writeProjectFile writes and creates file when allowed", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    const result = await writeProjectFile(rt, projectRoot, {
      targetPath: "mcp-fs-test/new-file.txt",
      content: "hello\nworld\n",
      createIfMissing: true,
      overwrite: true,
      createParents: false,
    });

    expect(result.path).toBe("mcp-fs-test/new-file.txt");
    expect(result.created).toBe(true);
    const content = await fs.readFile(path.join(projectRoot, "mcp-fs-test/new-file.txt"), "utf8");
    expect(content).toBe("hello\nworld\n");
  });

  test("writeProjectFile denies forbidden targets", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    await expect(writeProjectFile(rt, projectRoot, {
      targetPath: ".env",
      content: "SECRET=123\n",
      createIfMissing: true,
      overwrite: true,
    })).rejects.toThrow("Access denied by pre-read hook");
  });

  test("applyProjectPatch updates file content from unified diff", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    const patch = [
      "--- a/mcp-fs-test/a.js",
      "+++ b/mcp-fs-test/a.js",
      "@@ -1,2 +1,2 @@",
      "-const a = 1;",
      "+const a = 100;",
      " const b = 2;",
    ].join("\n");

    const result = await applyProjectPatch(rt, projectRoot, { patchText: patch });
    expect(result.file_count).toBe(1);
    expect(result.modified_files).toContain("mcp-fs-test/a.js");

    const content = await fs.readFile(path.join(projectRoot, "mcp-fs-test/a.js"), "utf8");
    expect(content).toContain("const a = 100;");
  });

  test("deleteProjectPath deletes directory recursively", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    const deleteDir = path.join(projectRoot, "mcp-fs-delete");
    await fs.mkdir(path.join(deleteDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(deleteDir, "sub", "x.txt"), "x\n", "utf8");

    const result = await deleteProjectPath(rt, projectRoot, {
      targetPath: "mcp-fs-delete",
      recursive: true,
    });

    expect(result.path).toBe("mcp-fs-delete");
    await expect(fs.stat(deleteDir)).rejects.toThrow();
  });

  test("deleteProjectPath blocks deleting project root", async () => {
    const rt = await createRuntime({ projectRoot, verbosity: "silent" });
    await expect(deleteProjectPath(rt, projectRoot, {
      targetPath: ".",
      recursive: true,
    })).rejects.toThrow("Deleting project root is not allowed");
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
