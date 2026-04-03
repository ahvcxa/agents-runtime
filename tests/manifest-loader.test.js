"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadManifest } = require("../src/loader/manifest-loader");

function mkProjectWithManifest(manifestObj) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-manifest-test-"));
  const agentsDir = path.join(root, ".agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, "manifest.json"), JSON.stringify(manifestObj, null, 2), "utf8");
  return root;
}

describe("manifest-loader validation", () => {
  test("throws when hooks is not an array", () => {
    const root = mkProjectWithManifest({
      spec_version: "1.0.0",
      entry_points: {},
      hooks: {},
      skills: [],
    });

    expect(() => loadManifest(root)).toThrow("'hooks' must be an array");
  });

  test("throws when skill path is missing", () => {
    const root = mkProjectWithManifest({
      spec_version: "1.0.0",
      entry_points: {},
      hooks: [{ id: "h1", path: ".agents/hooks/a.js", fires: "evt" }],
      skills: [{ id: "s1" }],
    });

    expect(() => loadManifest(root)).toThrow("skills[0].path must be a non-empty string");
  });
});
