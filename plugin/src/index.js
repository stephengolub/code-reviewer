/**
 * @stephengolub/code-reviewer-plugin
 *
 * OpenCode plugin providing:
 *   - call_graph tool: generate a Mermaid call graph for changed/specified files
 *   - code-review skill (companion — discovered via file system)
 *   - code-reviewer agent (bonus, via undocumented cfg.agent mutation — degrades gracefully)
 */

import { tool } from "@opencode-ai/plugin";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Shared core: import call-graph.js from the repo root
// When published to npm the bundler includes this file.
// ---------------------------------------------------------------------------
const CORE_PATH = resolve(__dirname, "../../src/call-graph.js");

async function getCore() {
  const mod = await import(CORE_PATH);
  return mod;
}

// ---------------------------------------------------------------------------
// Supported file extensions (mirrors call-graph.js detectLanguage)
// ---------------------------------------------------------------------------
const SUPPORTED_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs"]);

function isSupportedFile(filePath) {
  return SUPPORTED_EXTS.has(extname(filePath).toLowerCase());
}

// ---------------------------------------------------------------------------
// Diff source helpers
// ---------------------------------------------------------------------------

function execGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function getChangedFiles(cwd) {
  // Working tree: staged + unstaged changes
  const staged = execGit("git diff --cached --name-only", cwd);
  const unstaged = execGit("git diff --name-only", cwd);

  const combined = [staged, unstaged].filter(Boolean).join("\n").trim();
  if (combined) {
    return combined.split("\n").filter(Boolean);
  }

  // Fall back to branch diff vs origin
  const branch = execGit("git rev-parse --abbrev-ref HEAD", cwd);
  if (!branch) return [];

  const remoteHead = execGit("git symbolic-ref refs/remotes/origin/HEAD --short", cwd);
  const defaultBranch = remoteHead ? remoteHead.replace("origin/", "") : "main";

  const branchDiff = execGit(`git diff --name-only origin/${defaultBranch}...${branch}`, cwd);
  return branchDiff ? branchDiff.split("\n").filter(Boolean) : [];
}

function fetchGitHubPRDiff(url, cwd) {
  // Extract owner/repo/number from URL
  // e.g. https://github.com/owner/repo/pull/42
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`Cannot parse GitHub PR URL: ${url}`);
  const [, owner, repo, number] = m;

  const diff = execSync(
    `gh pr diff ${number} --repo ${owner}/${repo}`,
    { cwd, encoding: "utf8" }
  );

  // Extract +++ file paths from the diff
  const files = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      files.push(line.slice(6).trim());
    }
  }
  return files;
}

function fetchGitLabMRDiff(url, cwd) {
  // e.g. https://gitlab.com/owner/repo/-/merge_requests/42
  const m = url.match(/gitlab\.com\/(.+)\/-\/merge_requests\/(\d+)/);
  if (!m) throw new Error(`Cannot parse GitLab MR URL: ${url}`);
  const [, projectPath, number] = m;

  const diff = execSync(
    `glab mr diff ${number} --repo ${projectPath}`,
    { cwd, encoding: "utf8" }
  );

  const files = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      files.push(line.slice(6).trim());
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const CodeReviewerPlugin = async (ctx) => {
  return {
    // -------------------------------------------------------------------------
    // call_graph tool (documented API — the load-bearing piece)
    // -------------------------------------------------------------------------
    tool: {
      call_graph: tool({
        description:
          "Generate a Mermaid call graph for source files in the current diff or specified files. " +
          "Returns the Mermaid source, a mermaid.live URL for full interactive viewing, and a " +
          "temp file path for the .mmd source. Use this when the user asks about code structure, " +
          "call relationships, or wants to understand what a change touches.",
        args: {
          files: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe(
              "Explicit list of file paths to analyze. If omitted, uses the current working-tree diff."
            ),
          source: tool.schema
            .string()
            .optional()
            .describe(
              "Diff source override: 'working-tree' (default), a GitHub PR URL " +
              "(https://github.com/owner/repo/pull/N), or a GitLab MR URL " +
              "(https://gitlab.com/owner/repo/-/merge_requests/N)."
            ),
        },

        async execute(args, context) {
          const { directory } = context;

          // --- 1. Resolve the file list ---
          let filePaths = [];

          if (args.files && args.files.length > 0) {
            filePaths = args.files;
          } else if (args.source && args.source.includes("github.com")) {
            filePaths = fetchGitHubPRDiff(args.source, directory);
          } else if (args.source && args.source.includes("gitlab.com")) {
            filePaths = fetchGitLabMRDiff(args.source, directory);
          } else {
            filePaths = getChangedFiles(directory);
          }

          // --- 2. Filter to supported languages ---
          const supportedFiles = filePaths
            .filter(isSupportedFile)
            .filter((f) => !f.includes("node_modules"));

          if (supportedFiles.length === 0) {
            return {
              mermaid: "graph TD\n    _empty[\"No supported source files found\"]",
              url: "",
              mmdPath: "",
              message: "No Python, TypeScript, or Rust files found in the diff.",
            };
          }

          // --- 3. Read file contents (relative to cwd) ---
          const files = supportedFiles.map((f) => {
            const absPath = resolve(directory, f);
            let content = "";
            try {
              content = readFileSync(absPath, "utf8");
            } catch {
              // File may have been deleted in the diff — skip it
            }
            return { path: f, content };
          }).filter((f) => f.content);

          if (files.length === 0) {
            return {
              mermaid: "graph TD\n    _empty[\"Could not read any changed files\"]",
              url: "",
              mmdPath: "",
              message: "Changed files could not be read (may be deleted or outside working tree).",
            };
          }

          // --- 4. Build the call graph ---
          const { buildCallGraph } = await getCore();
          const { mermaid, url } = await buildCallGraph(files);

          // --- 5. Write .mmd to temp file (reserved for future PNG rendering) ---
          const mmdPath = join(tmpdir(), `code-review-${Date.now()}.mmd`);
          writeFileSync(mmdPath, mermaid, "utf8");

          return {
            mermaid,
            url,
            mmdPath,
            filesAnalyzed: files.map((f) => f.path),
          };
        },
      }),
    },

    // -------------------------------------------------------------------------
    // Agent registration (bonus — unofficial cfg.agent mutation)
    // Degrades gracefully: if this hook is ignored, the tool + skill still work.
    // -------------------------------------------------------------------------
    config: async (cfg) => {
      try {
        cfg.agent ??= {};
        // Only register if not already defined (don't override user customization)
        cfg.agent["code-reviewer"] ??= {
          description:
            "Interactive code review — augments your reading of a diff conversationally. " +
            "Has access to the call_graph tool for structural analysis.",
          mode: "primary",
          tools: {
            read: "allow",
            glob: "allow",
            grep: "allow",
            bash: "allow",
            webfetch: "allow",
            lsp: "allow",
            skill: "allow",
          },
          prompt: `You are an interactive code reviewer helping the user read and understand a diff.

Your style:
- Use "I" statements: "If it were me...", "I wonder if..."
- Frame findings as questions, not directives
- Be concise and focused — no flattery, no "strengths" sections
- Only flag things you're confident about; investigate before asserting
- Reference real line numbers from actual files (use the read tool)
- Review only the changes, not pre-existing code unless it's directly relevant

You have access to the call_graph tool. Use it when:
- The user asks about code structure or call relationships
- A change touches more than 2 functions and the structure would help understanding
- The user asks "what calls this" or "what does this affect"

When generating a call graph, present:
1. The Mermaid diagram in a fenced \`\`\`mermaid block (renders in supporting terminals)
2. The mermaid.live link for full interactive viewing

Before reviewing, check for project standards:
- Read AGENTS.md if it exists (look for ## Review Standards)
- Read .review/standards.yml if it exists

Load the code-review skill for full review workflow guidance.`,
        };
      } catch {
        // cfg mutation not supported in this version — degrade gracefully
      }
    },
  };
};

export default CodeReviewerPlugin;
