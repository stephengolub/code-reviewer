/**
 * Tests for the call_graph tool in the CodeReviewerPlugin.
 *
 * Covers:
 * - Output contract: { mermaid, url, mmdPath, filesAnalyzed }
 * - Explicit files arg: analyzes exactly those files
 * - Unsupported-only files: returns graceful fallback, no crash
 * - mmdPath: temp file exists and contains the Mermaid source
 * - Deleted/unreadable files: skipped gracefully
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "../../tests/fixtures");

// Extract the call_graph tool's execute function from the plugin
let callGraphExecute;
before(async () => {
  const { CodeReviewerPlugin } = await import("../src/index.js");
  const plugin = await CodeReviewerPlugin({});
  callGraphExecute = plugin.tool.call_graph.execute;
});

// Minimal context object the tool expects
const ctx = (dir = FIXTURES) => ({ directory: dir });

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

describe("call_graph tool — output contract", () => {
  it("returns mermaid, url, mmdPath, and filesAnalyzed for a Python file", async () => {
    const result = await callGraphExecute(
      { files: [resolve(FIXTURES, "latency_report.py")] },
      ctx()
    );

    assert.ok(typeof result === "object", "should return an object");
    assert.ok(typeof result.mermaid === "string", "mermaid should be a string");
    assert.ok(result.mermaid.includes("graph TD"), "mermaid should be valid Mermaid");
    assert.ok(
      typeof result.url === "string" && result.url.startsWith("https://mermaid.live/"),
      "url should be a mermaid.live URL"
    );
    assert.ok(typeof result.mmdPath === "string" && result.mmdPath.length > 0, "mmdPath should be set");
    assert.ok(Array.isArray(result.filesAnalyzed), "filesAnalyzed should be an array");
  });

  it("mmdPath file exists and contains the Mermaid source", async () => {
    const result = await callGraphExecute(
      { files: [resolve(FIXTURES, "latency_report.py")] },
      ctx()
    );

    assert.ok(existsSync(result.mmdPath), "mmdPath temp file should exist on disk");
    const content = readFileSync(result.mmdPath, "utf8");
    assert.equal(content, result.mermaid, "mmdPath file should contain the mermaid source");
  });

  it("includes the analyzed file in filesAnalyzed", async () => {
    const filePath = resolve(FIXTURES, "simple.ts");
    const result = await callGraphExecute({ files: [filePath] }, ctx());
    assert.ok(
      result.filesAnalyzed.some((f) => f.includes("simple.ts")),
      "filesAnalyzed should include the requested file"
    );
  });
});

// ---------------------------------------------------------------------------
// Multi-language
// ---------------------------------------------------------------------------

describe("call_graph tool — multi-language", () => {
  it("handles a TypeScript file", async () => {
    const result = await callGraphExecute(
      { files: [resolve(FIXTURES, "simple.ts")] },
      ctx()
    );
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.mermaid.includes("greet"), "should include greet function");
    assert.ok(result.url.startsWith("https://mermaid.live/"));
  });

  it("handles a Rust file", async () => {
    const result = await callGraphExecute(
      { files: [resolve(FIXTURES, "simple.rs")] },
      ctx()
    );
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.mermaid.includes("main"), "should include main function");
  });

  it("handles multiple files of different languages", async () => {
    const result = await callGraphExecute(
      {
        files: [
          resolve(FIXTURES, "latency_report.py"),
          resolve(FIXTURES, "simple.ts"),
        ],
      },
      ctx()
    );
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.mermaid.includes("main"));
    assert.ok(result.mermaid.includes("greet"));
  });
});

// ---------------------------------------------------------------------------
// Graceful fallback
// ---------------------------------------------------------------------------

describe("call_graph tool — graceful fallback", () => {
  it("returns a fallback when only unsupported files are given", async () => {
    const result = await callGraphExecute(
      { files: ["config.yml", "README.md", ".env.example"] },
      ctx()
    );
    assert.ok(typeof result === "object", "should return an object, not throw");
    assert.ok(typeof result.mermaid === "string", "mermaid should be a string");
    assert.ok(typeof result.message === "string", "should include a message");
    assert.ok(!result.filesAnalyzed || result.filesAnalyzed.length === 0,
      "filesAnalyzed should be empty");
  });

  it("returns a fallback when an empty file list is given with no git context", async () => {
    // Pass an explicit empty files array — should not crash
    const result = await callGraphExecute(
      { files: [] },
      ctx("/tmp")  // no git repo, no changed files
    );
    assert.ok(typeof result === "object");
    assert.ok(typeof result.mermaid === "string");
  });

  it("skips unreadable files gracefully", async () => {
    const result = await callGraphExecute(
      { files: ["/nonexistent/path/to/file.py", resolve(FIXTURES, "simple.ts")] },
      ctx()
    );
    // Should still produce a valid result from the readable file
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.filesAnalyzed.every((f) => !f.includes("nonexistent")),
      "unreadable files should not appear in filesAnalyzed");
  });
});

// ---------------------------------------------------------------------------
// Plugin structure
// ---------------------------------------------------------------------------

describe("CodeReviewerPlugin — structure", () => {
  it("exports the plugin as default and named export", async () => {
    const mod = await import("../src/index.js");
    assert.ok(typeof mod.CodeReviewerPlugin === "function", "named export should be a function");
    assert.ok(typeof mod.default === "function", "default export should be a function");
    assert.equal(mod.default, mod.CodeReviewerPlugin, "default and named should be the same");
  });

  it("plugin returns a tool named call_graph", async () => {
    const { CodeReviewerPlugin } = await import("../src/index.js");
    const plugin = await CodeReviewerPlugin({});
    assert.ok(plugin.tool?.call_graph, "should have a call_graph tool");
    assert.ok(typeof plugin.tool.call_graph.execute === "function", "tool should have an execute fn");
  });

  it("plugin returns a config hook", async () => {
    const { CodeReviewerPlugin } = await import("../src/index.js");
    const plugin = await CodeReviewerPlugin({});
    assert.ok(typeof plugin.config === "function", "should have a config hook");
  });

  it("config hook registers code-review command", async () => {
    const { CodeReviewerPlugin } = await import("../src/index.js");
    const plugin = await CodeReviewerPlugin({});
    const cfg = {};
    await plugin.config(cfg);
    assert.ok(cfg.command?.["code-review"], "should register code-review command");
    assert.ok(
      typeof cfg.command["code-review"].template === "string",
      "command should have a template"
    );
    assert.ok(
      cfg.command["code-review"].template.includes("code-review"),
      "template should reference the code-review skill"
    );
    assert.ok(
      cfg.command["code-review"].template.includes("$ARGUMENTS"),
      "template should include $ARGUMENTS placeholder"
    );
    assert.ok(
      typeof cfg.command["code-review"].description === "string",
      "command should have a description"
    );
  });

  it("config hook does not overwrite a pre-existing code-review command", async () => {
    const { CodeReviewerPlugin } = await import("../src/index.js");
    const plugin = await CodeReviewerPlugin({});
    const existing = { template: "my custom review", description: "custom" };
    const cfg = { command: { "code-review": existing } };
    await plugin.config(cfg);
    assert.equal(
      cfg.command["code-review"], existing,
      "should not overwrite an existing command definition"
    );
  });

  it("config hook does not register an agent", async () => {
    const { CodeReviewerPlugin } = await import("../src/index.js");
    const plugin = await CodeReviewerPlugin({});
    const cfg = {};
    await plugin.config(cfg);
    assert.ok(
      !cfg.agent?.["code-reviewer"],
      "should not register a code-reviewer agent"
    );
  });
});
