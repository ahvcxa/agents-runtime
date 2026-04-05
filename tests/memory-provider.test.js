"use strict";

const { InProcessMemoryProvider, cosineScore } = require("../src/memory/providers/in-process-memory-provider");

describe("InProcessMemoryProvider", () => {
  test("stores and retrieves long-term memory", async () => {
    const provider = new InProcessMemoryProvider();
    await provider.init();
    await provider.store("insight:1", { answer: 42 }, { text: "the answer is 42" });

    const row = await provider.retrieve("insight:1", { namespace: "long_term" });
    expect(row.value).toEqual({ answer: 42 });
  });

  test("stores and retrieves session memory", async () => {
    const provider = new InProcessMemoryProvider();
    await provider.store("step-1", { text: "hello" }, {
      namespace: "session",
      session_id: "s1",
      role: "assistant",
    });

    const rows = await provider.retrieve("*", { namespace: "session", session_id: "s1" });
    expect(rows.length).toBe(1);
    expect(rows[0].value).toEqual({ text: "hello" });
  });

  test("semantic search returns ranked hits", async () => {
    const provider = new InProcessMemoryProvider();
    await provider.store("a", { text: "oauth token rotation" }, { text: "oauth token rotation policy" });
    await provider.store("b", { text: "docker sandboxing" }, { text: "docker container limits" });

    const hits = await provider.semanticSearch("oauth", { top_k: 2 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].key).toBe("a");
  });

  test("cosineScore returns zero for empty text", () => {
    expect(cosineScore("", "abc")).toBe(0);
  });
});
