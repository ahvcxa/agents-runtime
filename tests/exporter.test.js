"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { exportReport } = require("../src/report/exporter");

describe("report exporter", () => {
  test("exports json report", () => {
    const out = path.join(os.tmpdir(), `agents-report-${Date.now()}.json`);
    const result = exportReport({ result: { ok: true }, outputPath: out, format: "json" });
    expect(fs.existsSync(result)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(result, "utf8"));
    expect(parsed.ok).toBe(true);
  });

  test("exports html report", () => {
    const out = path.join(os.tmpdir(), `agents-report-${Date.now()}.html`);
    const result = exportReport({ result: { ok: true }, outputPath: out, format: "html" });
    const content = fs.readFileSync(result, "utf8");
    expect(content).toMatch(/<!doctype html>/i);
  });

  test("exports pdf report", () => {
    const out = path.join(os.tmpdir(), `agents-report-${Date.now()}.pdf`);
    const result = exportReport({ result: { ok: true }, outputPath: out, format: "pdf" });
    const content = fs.readFileSync(result, "utf8");
    expect(content.startsWith("%PDF-1.1")).toBe(true);
  });
});
