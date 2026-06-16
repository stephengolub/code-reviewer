/**
 * call-graph.js
 *
 * Builds a Mermaid call-graph from source files using tree-sitter WASM grammars.
 * Supports Python, TypeScript, and Rust.
 *
 * Exports:
 *   extractDefinitions(source, language) -> Definition[]
 *   extractEdges(source, language, defs)  -> Edge[]
 *   toMermaid(defs, edges)               -> string
 *   buildCallGraph(files)                -> Promise<string>
 *
 * CLI: node src/call-graph.js <file1> [file2 ...]
 *   Reads each file, builds the combined graph, prints Mermaid to stdout.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Grammar loading (lazy, cached)
// ---------------------------------------------------------------------------

let ParserClass = null;
const grammarCache = new Map();

async function getParser() {
  if (ParserClass) return ParserClass;
  // web-tree-sitter@0.24.x: default export IS the Parser constructor.
  // Parser.Language is the Language class. Parser.init() loads the WASM runtime.
  const TreeSitter = (await import("web-tree-sitter")).default;
  await TreeSitter.init();
  ParserClass = TreeSitter;
  return TreeSitter;
}

/**
 * Returns the node type names used by each language for:
 * - function definitions
 * - class definitions (to scope method names)
 * - call expressions
 * - how to get the callee name from a call node
 */
const LANG_CONFIG = {
  python: {
    wasmName: "tree-sitter-python",
    functionTypes: ["function_definition"],
    classTypes: ["class_definition"],
    callTypes: ["call"],
    // In Python: call -> function -> identifier | attribute -> identifier
    getCallName: (node) => {
      const fn = node.childForFieldName("function");
      if (!fn) return null;
      if (fn.type === "identifier") return fn.text;
      if (fn.type === "attribute") {
        // method call: obj.method() — return just the method name
        const attr = fn.childForFieldName("attribute");
        return attr ? attr.text : null;
      }
      return null;
    },
  },
  typescript: {
    wasmName: "tree-sitter-typescript",
    functionTypes: [
      "function_declaration",
      "function",
      "arrow_function",
      "method_definition",
    ],
    classTypes: ["class_declaration", "class"],
    callTypes: ["call_expression"],
    // TS: call_expression -> function -> identifier | member_expression
    getCallName: (node) => {
      const fn = node.childForFieldName("function");
      if (!fn) return null;
      if (fn.type === "identifier") return fn.text;
      if (fn.type === "member_expression") {
        // obj.method() — return method name
        const prop = fn.childForFieldName("property");
        return prop ? prop.text : null;
      }
      return null;
    },
  },
  rust: {
    wasmName: "tree-sitter-rust",
    functionTypes: ["function_item"],
    classTypes: [], // Rust has impl blocks, not classes
    callTypes: ["call_expression"],
    // Rust: call_expression -> function -> identifier | field_expression | scoped_identifier
    getCallName: (node) => {
      // First child is the function being called
      const fn = node.firstChild;
      if (!fn) return null;
      if (fn.type === "identifier") return fn.text;
      if (fn.type === "scoped_identifier") {
        // e.g. MyStruct::new — return the last segment
        const last = fn.lastChild;
        return last ? last.text : null;
      }
      if (fn.type === "field_expression") {
        const field = fn.childForFieldName("field");
        return field ? field.text : null;
      }
      return null;
    },
  },
};

/**
 * Detect language from file extension.
 * Returns null for unsupported types.
 */
function detectLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".py": return "python";
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs": return "typescript";
    case ".rs": return "rust";
    default: return null;
  }
}

/**
 * Load a tree-sitter language grammar (WASM), cached per language.
 */
async function loadLanguage(langKey) {
  if (grammarCache.has(langKey)) return grammarCache.get(langKey);

  const TreeSitter = await getParser();
  const config = LANG_CONFIG[langKey];
  if (!config) throw new Error(`Unsupported language: ${langKey}`);

  // Resolve the .wasm file from tree-sitter-wasms package
  const wasmPath = resolve(
    fileURLToPath(import.meta.url),
    "../../node_modules/tree-sitter-wasms/out",
    `${config.wasmName}.wasm`
  );

  const lang = await TreeSitter.Language.load(wasmPath);
  grammarCache.set(langKey, lang);
  return lang;
}

// ---------------------------------------------------------------------------
// Core: walk a tree-sitter tree
// ---------------------------------------------------------------------------

/**
 * Walk all nodes in a tree-sitter tree, calling visitor for each.
 */
function walk(node, visitor) {
  visitor(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, visitor);
  }
}

/**
 * Find the nearest ancestor node whose type is in the given set.
 * Returns null if not found.
 */
function findAncestor(node, types) {
  let cur = node.parent;
  while (cur) {
    if (types.includes(cur.type)) return cur;
    cur = cur.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// extractDefinitions
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string, line: number, type: 'function' | 'method' }} Definition
 */

/**
 * Extract all function/method definitions from source code.
 *
 * @param {string} source
 * @param {string} language  "python" | "typescript" | "rust"
 * @returns {Promise<Definition[]>}
 */
export async function extractDefinitions(source, language) {
  const TreeSitter = await getParser();
  const lang = await loadLanguage(language);
  const config = LANG_CONFIG[language];

  const parser = new TreeSitter();
  parser.setLanguage(lang);
  const tree = parser.parse(source);

  const defs = [];
  const seen = new Set();

  walk(tree.rootNode, (node) => {
    if (!config.functionTypes.includes(node.type)) return;

    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const name = nameNode.text;
    if (!name || seen.has(name)) return; // skip duplicates at same name

    seen.add(name);
    defs.push({
      name,
      line: node.startPosition.row + 1,
      type: findAncestor(node, config.classTypes) ? "method" : "function",
    });
  });

  return defs;
}

// ---------------------------------------------------------------------------
// extractEdges
// ---------------------------------------------------------------------------

/**
 * @typedef {{ caller: string, callee: string }} Edge
 */

/**
 * Extract call edges between functions defined in the same file.
 * Only emits edges where the callee is in the provided definitions list
 * (no stdlib noise).
 *
 * @param {string} source
 * @param {string} language
 * @param {Definition[]} defs
 * @returns {Promise<Edge[]>}
 */
export async function extractEdges(source, language, defs) {
  const TreeSitter = await getParser();
  const lang = await loadLanguage(language);
  const config = LANG_CONFIG[language];

  const parser = new TreeSitter();
  parser.setLanguage(lang);
  const tree = parser.parse(source);

  const defNames = new Set(defs.map((d) => d.name));

  // Build a lookup: line number -> function name, so we can find
  // which function a call site is inside.
  // Sort defs by line ascending so we can do a simple range check.
  const sortedDefs = [...defs].sort((a, b) => a.line - b.line);

  function callerAt(line) {
    // The caller is the last def whose start line is <= the call's line
    let caller = null;
    for (const def of sortedDefs) {
      if (def.line <= line) caller = def.name;
      else break;
    }
    return caller;
  }

  const edgeSet = new Set();
  const edges = [];

  walk(tree.rootNode, (node) => {
    if (!config.callTypes.includes(node.type)) return;

    const callee = config.getCallName(node);
    if (!callee || !defNames.has(callee)) return;

    const callLine = node.startPosition.row + 1;
    const caller = callerAt(callLine);
    if (!caller || caller === callee) return; // skip self-calls

    const key = `${caller}->${callee}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ caller, callee });
  });

  return edges;
}

// ---------------------------------------------------------------------------
// toMermaid
// ---------------------------------------------------------------------------

/**
 * Render definitions and edges as a Mermaid graph TD string.
 *
 * @param {Definition[]} defs
 * @param {Edge[]} edges
 * @returns {string}
 */
export function toMermaid(defs, edges) {
  if (defs.length === 0) {
    return "graph TD\n    _empty[\"No functions found\"]";
  }

  const lines = ["graph TD"];

  // Sanitize names for Mermaid node IDs (no special chars)
  const id = (name) => name.replace(/[^a-zA-Z0-9_]/g, "_");

  // Declare all nodes with labels showing the function name
  const connected = new Set([
    ...edges.map((e) => e.caller),
    ...edges.map((e) => e.callee),
  ]);

  // Add isolated nodes (not in any edge)
  for (const def of defs) {
    if (!connected.has(def.name)) {
      lines.push(`    ${id(def.name)}["${def.name}()"]`);
    }
  }

  // Add edges (implicitly declares the nodes)
  for (const edge of edges) {
    lines.push(`    ${id(edge.caller)}["${edge.caller}()"] --> ${id(edge.callee)}["${edge.callee}()"]`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// toMermaidLiveUrl
// ---------------------------------------------------------------------------

/**
 * Encode a Mermaid diagram string as a mermaid.live URL.
 * mermaid.live uses base64url-encoded JSON: { code, mermaid: { theme } }
 *
 * @param {string} mermaid
 * @returns {string}  Full https://mermaid.live/view#... URL
 */
export function toMermaidLiveUrl(mermaid) {
  const payload = JSON.stringify({
    code: mermaid,
    mermaid: { theme: "default" },
    updateEditor: false,
    autoSync: true,
    updateDiagram: true,
  });
  // Base64url encoding (URL-safe, no padding)
  const encoded = Buffer.from(payload)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `https://mermaid.live/view#base64:${encoded}`;
}

// ---------------------------------------------------------------------------
// buildCallGraph — public API
// ---------------------------------------------------------------------------

/**
 * Build a Mermaid call graph from a list of changed files.
 *
 * @param {{ path: string, content: string }[]} files
 * @returns {Promise<{ mermaid: string, url: string }>}
 */
export async function buildCallGraph(files) {
  const allDefs = [];
  const allEdges = [];
  let anySupported = false;

  for (const file of files) {
    const lang = detectLanguage(file.path);
    if (!lang) continue;
    anySupported = true;

    try {
      const defs = await extractDefinitions(file.content, lang);
      const edges = await extractEdges(file.content, lang, defs);
      allDefs.push(...defs);
      allEdges.push(...edges);
    } catch (err) {
      // Don't let one file failure kill the whole graph
      console.error(`call-graph: failed to parse ${file.path}: ${err.message}`);
    }
  }

  if (!anySupported) {
    const mermaid = "graph TD\n    _unsupported[\"No supported files in diff\"]";
    return { mermaid, url: toMermaidLiveUrl(mermaid) };
  }

  // Deduplicate edges across files
  const seen = new Set();
  const dedupedEdges = allEdges.filter((e) => {
    const key = `${e.caller}->${e.callee}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const mermaid = toMermaid(allDefs, dedupedEdges);
  return { mermaid, url: toMermaidLiveUrl(mermaid) };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0) {
    console.error("Usage: node src/call-graph.js <file1> [file2 ...]");
    process.exit(1);
  }

  const files = filePaths.map((p) => ({
    path: p,
    content: readFileSync(p, "utf8"),
  }));

  buildCallGraph(files).then(({ mermaid, url }) => {
    console.log(mermaid);
    console.error(`mermaid.live: ${url}`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
