import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lazy import so tests describe() before the module is loaded
let buildCallGraph, extractDefinitions, extractEdges, toMermaid, toMermaidLiveUrl;

before(async () => {
  const mod = await import("../src/call-graph.js");
  buildCallGraph = mod.buildCallGraph;
  extractDefinitions = mod.extractDefinitions;
  extractEdges = mod.extractEdges;
  toMermaid = mod.toMermaid;
  toMermaidLiveUrl = mod.toMermaidLiveUrl;
});

const fixture = (name) =>
  readFileSync(resolve(__dirname, "fixtures", name), "utf8");

// ---------------------------------------------------------------------------
// extractDefinitions
// ---------------------------------------------------------------------------

describe("extractDefinitions — Python", () => {
  it("finds all top-level functions in latency_report.py", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");

    const names = defs.map((d) => d.name);
    assert.ok(names.includes("parse_susfactor_log_line"), "missing parse_susfactor_log_line");
    assert.ok(names.includes("compute_stats"), "missing compute_stats");
    assert.ok(names.includes("format_report"), "missing format_report");
    assert.ok(names.includes("main"), "missing main");
    assert.ok(names.includes("_percentile"), "missing _percentile");
    assert.ok(names.includes("_run_load"), "missing _run_load");
    assert.ok(names.includes("_send_request"), "missing _send_request");
    assert.ok(names.includes("_results_from_logs"), "missing _results_from_logs");
  });

  it("finds class methods in latency_report.py", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");

    const names = defs.map((d) => d.name);
    assert.ok(names.includes("success"), "missing RequestResult.success property");
  });

  it("includes line numbers", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");

    const mainDef = defs.find((d) => d.name === "main");
    assert.ok(mainDef, "main not found");
    assert.ok(typeof mainDef.line === "number", "line should be a number");
    assert.ok(mainDef.line > 0, "line should be > 0");
  });
});

describe("extractDefinitions — TypeScript", () => {
  it("finds all functions in simple.ts", async () => {
    const source = fixture("simple.ts");
    const defs = await extractDefinitions(source, "typescript");

    const names = defs.map((d) => d.name);
    assert.ok(names.includes("greet"), "missing greet");
    assert.ok(names.includes("formatMessage"), "missing formatMessage");
    assert.ok(names.includes("fetchAndGreet"), "missing fetchAndGreet");
    assert.ok(names.includes("fetchName"), "missing fetchName");
  });
});

describe("extractDefinitions — Rust", () => {
  it("finds all functions in simple.rs", async () => {
    const source = fixture("simple.rs");
    const defs = await extractDefinitions(source, "rust");

    const names = defs.map((d) => d.name);
    assert.ok(names.includes("main"), "missing main");
    assert.ok(names.includes("compute"), "missing compute");
    assert.ok(names.includes("multiply"), "missing multiply");
    assert.ok(names.includes("format_result"), "missing format_result");
  });
});

// ---------------------------------------------------------------------------
// extractEdges
// ---------------------------------------------------------------------------

describe("extractEdges — Python", () => {
  it("finds calls from main() to compute_stats and format_report", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");
    const edges = await extractEdges(source, "python", defs);

    const fromMain = edges.filter((e) => e.caller === "main");
    const callees = fromMain.map((e) => e.callee);
    assert.ok(callees.includes("compute_stats"), "main should call compute_stats");
    assert.ok(callees.includes("format_report"), "main should call format_report");
  });

  it("finds call from compute_stats to _percentile", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");
    const edges = await extractEdges(source, "python", defs);

    const hit = edges.some(
      (e) => e.caller === "compute_stats" && e.callee === "_percentile"
    );
    assert.ok(hit, "compute_stats should call _percentile");
  });

  it("only includes edges where callee is defined in the same file", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");
    const edges = await extractEdges(source, "python", defs);

    const defNames = new Set(defs.map((d) => d.name));
    for (const edge of edges) {
      assert.ok(
        defNames.has(edge.callee),
        `edge callee "${edge.callee}" is not defined in this file`
      );
    }
  });

  it("produces no duplicate edges", async () => {
    const source = fixture("latency_report.py");
    const defs = await extractDefinitions(source, "python");
    const edges = await extractEdges(source, "python", defs);

    const seen = new Set();
    for (const e of edges) {
      const key = `${e.caller}->${e.callee}`;
      assert.ok(!seen.has(key), `duplicate edge: ${key}`);
      seen.add(key);
    }
  });
});

describe("extractEdges — TypeScript", () => {
  it("finds greet -> formatMessage and fetchAndGreet -> greet", async () => {
    const source = fixture("simple.ts");
    const defs = await extractDefinitions(source, "typescript");
    const edges = await extractEdges(source, "typescript", defs);

    assert.ok(
      edges.some((e) => e.caller === "greet" && e.callee === "formatMessage"),
      "greet should call formatMessage"
    );
    assert.ok(
      edges.some((e) => e.caller === "fetchAndGreet" && e.callee === "greet"),
      "fetchAndGreet should call greet"
    );
  });
});

describe("extractEdges — Rust", () => {
  it("finds main -> compute and compute -> multiply", async () => {
    const source = fixture("simple.rs");
    const defs = await extractDefinitions(source, "rust");
    const edges = await extractEdges(source, "rust", defs);

    assert.ok(
      edges.some((e) => e.caller === "main" && e.callee === "compute"),
      "main should call compute"
    );
    assert.ok(
      edges.some((e) => e.caller === "compute" && e.callee === "multiply"),
      "compute should call multiply"
    );
  });
});

// ---------------------------------------------------------------------------
// toMermaid
// ---------------------------------------------------------------------------

describe("toMermaid", () => {
  it("produces valid mermaid graph TD header", () => {
    const mermaid = toMermaid(
      [{ name: "foo", line: 1 }, { name: "bar", line: 5 }],
      [{ caller: "foo", callee: "bar" }]
    );
    assert.ok(mermaid.startsWith("graph TD"), "should start with 'graph TD'");
  });

  it("includes all edge relationships", () => {
    const mermaid = toMermaid(
      [{ name: "foo", line: 1 }, { name: "bar", line: 5 }, { name: "baz", line: 10 }],
      [
        { caller: "foo", callee: "bar" },
        { caller: "bar", callee: "baz" },
      ]
    );
    assert.ok(mermaid.includes("foo"), "should include foo");
    assert.ok(mermaid.includes("bar"), "should include bar");
    assert.ok(mermaid.includes("baz"), "should include baz");
    assert.ok(mermaid.includes("-->"), "should include --> arrows");
  });

  it("handles empty edges gracefully", () => {
    const mermaid = toMermaid([{ name: "foo", line: 1 }], []);
    assert.ok(typeof mermaid === "string", "should return a string");
    assert.ok(mermaid.includes("foo"), "should include isolated node");
  });

  it("returns a note when there are no definitions", () => {
    const mermaid = toMermaid([], []);
    assert.ok(typeof mermaid === "string");
    assert.ok(mermaid.length > 0);
  });
});

// ---------------------------------------------------------------------------
// toMermaidLiveUrl
// ---------------------------------------------------------------------------

describe("toMermaidLiveUrl", () => {
  it("returns a mermaid.live URL", () => {
    const mermaid = "graph TD\n    A --> B";
    const url = toMermaidLiveUrl(mermaid);
    assert.ok(url.startsWith("https://mermaid.live/view#base64:"), "should be a mermaid.live URL");
  });

  it("URL decodes back to the original diagram", () => {
    const mermaid = "graph TD\n    foo[\"foo()\"] --> bar[\"bar()\"]";
    const url = toMermaidLiveUrl(mermaid);
    const encoded = url.split("#base64:")[1];
    // Restore base64 padding
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const decoded = JSON.parse(Buffer.from(padded + pad, "base64").toString("utf8"));
    assert.equal(decoded.code, mermaid);
  });

  it("produces different URLs for different diagrams", () => {
    const url1 = toMermaidLiveUrl("graph TD\n    A --> B");
    const url2 = toMermaidLiveUrl("graph TD\n    X --> Y");
    assert.notEqual(url1, url2);
  });
});

// ---------------------------------------------------------------------------
// buildCallGraph — integration
// ---------------------------------------------------------------------------

describe("buildCallGraph — integration", () => {
  it("returns mermaid and url for a Python file", async () => {
    const source = fixture("latency_report.py");
    const result = await buildCallGraph([{ path: "scripts/latency_report.py", content: source }]);
    assert.ok(typeof result === "object", "should return an object");
    assert.ok(result.mermaid.includes("graph TD"), "mermaid should be valid");
    assert.ok(result.mermaid.includes("main"), "should include main");
    assert.ok(result.mermaid.includes("compute_stats"), "should include compute_stats");
    assert.ok(result.url.startsWith("https://mermaid.live/"), "should include a url");
  });

  it("returns mermaid and url for a TypeScript file", async () => {
    const source = fixture("simple.ts");
    const result = await buildCallGraph([{ path: "src/simple.ts", content: source }]);
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.mermaid.includes("greet"));
    assert.ok(result.url.startsWith("https://mermaid.live/"));
  });

  it("returns mermaid and url for a Rust file", async () => {
    const source = fixture("simple.rs");
    const result = await buildCallGraph([{ path: "src/simple.rs", content: source }]);
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.mermaid.includes("main"));
    assert.ok(result.url.startsWith("https://mermaid.live/"));
  });

  it("handles multiple files in one graph", async () => {
    const py = fixture("latency_report.py");
    const ts = fixture("simple.ts");
    const result = await buildCallGraph([
      { path: "scripts/latency_report.py", content: py },
      { path: "src/simple.ts", content: ts },
    ]);
    assert.ok(result.mermaid.includes("graph TD"));
    assert.ok(result.mermaid.includes("main"));
    assert.ok(result.mermaid.includes("greet"));
    assert.ok(result.url.startsWith("https://mermaid.live/"));
  });

  it("returns a fallback for unsupported file types", async () => {
    const result = await buildCallGraph([{ path: "config.yml", content: "foo: bar" }]);
    assert.ok(typeof result === "object");
    assert.ok(typeof result.mermaid === "string");
    assert.ok(typeof result.url === "string");
  });
});
