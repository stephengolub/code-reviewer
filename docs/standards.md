# Customizing Review Standards

The reviewer has two tiers of behavior:

- **Tier 1 — Security floor**: always on, cannot be disabled. Flags hardcoded secrets,
  injection, weak crypto, path traversal, missing authorization, and more. See
  [security-floor.md](security-floor.md).
- **Tier 2 — Loose baseline**: fully overridable quality and style findings. This is
  what you customize here.

There are two ways to define standards. Use one or both.

---

## Option 1: `AGENTS.md` prose (recommended for most projects)

Add a `## Review Standards` section to your repo's `AGENTS.md`. Write it in plain
English — the reviewer reads it before analyzing the PR and applies your instructions
throughout.

```markdown
## Review Standards

- We use the repository pattern. Flag any direct database calls outside of a
  `*Repository` or `*Store` class.
- `app/legacy/**` is frozen code that we are not actively maintaining. Do not suggest
  refactors or flag style issues there.
- Our acceptance criteria come from linked Linear issues, not the PR body. If no
  issue is linked, note that criteria are missing.
- We prefer early returns over deeply nested conditionals. Flag nesting depth > 3.
- Test files live in `tests/` and mirror the `src/` structure. A logic file with no
  corresponding test file is always a finding.
```

**What to put here:**
- Architectural patterns your codebase enforces (repository pattern, hexagonal arch,
  specific layering rules)
- Directories or files to skip or treat differently
- Where acceptance criteria live (PR body, linked issue, spec file)
- Code style preferences worth enforcing in review
- Known technical debt areas where findings should be suppressed
- Team conventions that wouldn't be obvious to an outside reviewer

**What not to put here:**
- Things already covered by your linter or formatter — the reviewer will duplicate
  them noisily
- Rules so broad they generate false positives on every PR ("always add error handling")
- Tier 1 security rules — those are always on regardless

There is no schema to learn. Write it the way you'd brief a new senior engineer joining
your team.

---

## Option 2: `.review/standards.yml` (for structured configuration)

Create `.review/standards.yml` in your repo root for settings that need to be
deterministic — paths to ignore, boilerplate patterns, severity thresholds.

```yaml
# .review/standards.yml

# Files matching these patterns are skipped entirely — not reviewed, not listed.
ignore_paths:
  - "vendor/**"
  - "**/*.generated.ts"
  - "**/*.pb.go"
  - "db/schema.rb"

# Files matching these patterns are collapsed into the Boilerplate section.
# They appear in the review but don't get quality findings.
boilerplate_patterns:
  - "**/migrations/**"
  - "**/fixtures/**"
  - "**/__snapshots__/**"
  - "**/generated/**"

# Where to pull acceptance criteria from.
# Options: github_issue | pr_body | none
# github_issue: reads the linked issue body (requires issues: read permission)
# pr_body: reads the PR description (default)
# none: skips the acceptance criteria section
acceptance_criteria_source:
  type: github_issue

# Adjust Tier 2 finding severity thresholds.
# Options per rule: off | info | warn | error
# off: finding is suppressed entirely
# info: appears as a note, not a finding
# warn: default — appears as 🟡 medium
# error: escalated to 🔴 high
smell_severity:
  long_method: warn
  duplicate_code: warn
  deep_nesting: warn
  missing_tests: error      # escalate missing test coverage to high
  unclear_naming: info      # downgrade naming issues to informational
  dead_code: warn
```

### Full schema reference

#### `ignore_paths`
Type: `string[]` — glob patterns  
Files matching any pattern are skipped completely. They don't appear anywhere in the
review comment. Use for generated files, vendored dependencies, or binary assets.

#### `boilerplate_patterns`
Type: `string[]` — glob patterns  
Files matching any pattern are categorized as `boilerplate` and collapsed into the
`📦 Boilerplate & Generated Files` section. They are listed but not given quality
findings. Use for migrations, fixtures, snapshots, and generated code you still want
to know changed.

#### `acceptance_criteria_source`
Type: object  
Controls where the reviewer looks for acceptance criteria to put at the top of the
review comment.

| Value | Behavior |
|---|---|
| `type: pr_body` | Reads the PR description (default) |
| `type: github_issue` | Reads the body of the linked GitHub issue |
| `type: none` | Omits the acceptance criteria section entirely |

For `github_issue` to work, your workflow needs `issues: read` permission (included in
the default workflow).

#### `smell_severity`
Type: `object` — rule name → severity level  
Adjusts Tier 2 finding thresholds. Tier 1 security findings are unaffected.

Available rules:

| Rule | Default | What it flags |
|---|---|---|
| `long_method` | `warn` | Functions/methods over ~40 lines |
| `duplicate_code` | `warn` | Similar logic appearing in multiple places |
| `deep_nesting` | `warn` | Conditionals or loops nested more than 3 levels |
| `missing_tests` | `warn` | Logic files with no corresponding test file |
| `unclear_naming` | `warn` | Variables, functions, or types with ambiguous names |
| `dead_code` | `warn` | Unreachable code, unused variables, unused imports |

Severity levels:

| Level | Behavior |
|---|---|
| `off` | Finding is suppressed entirely |
| `info` | Appears as a note in the summary, not a table row |
| `warn` | Appears as 🟡 medium in the findings table |
| `error` | Appears as 🔴 high and generates an inline comment |

---

## Using both together

`AGENTS.md` and `.review/standards.yml` complement each other. A typical setup:

- Use `.review/standards.yml` for paths, patterns, and severity thresholds — things
  that need to be exact.
- Use `AGENTS.md` for everything else — architectural rules, team conventions, focus
  areas, and anything that benefits from natural language nuance.

Both are read before every review. If they conflict, `AGENTS.md` takes precedence
(prose instructions are applied last).

---

## Suppressing a security finding

Tier 1 security findings cannot be disabled via config. If a specific finding is a
false positive, suppress it inline with a reason:

```python
API_KEY = "test-key-do-not-use"  # review-ignore: HARDCODED_SECRET — test fixture only, not deployed
```

```typescript
const result = eval(expression)  // review-ignore: UNSAFE_EVAL — expression is validated against an allowlist at L89
```

```rust
let cmd = Command::new(&user_input);  // review-ignore: COMMAND_INJECTION — input sanitized by validate_command() at L34
```

Rules:
- Token: `review-ignore: RULE_ID — reason` (the reason is required)
- The finding is demoted from ❌ to ⚠️ acknowledged in the review comment
- It is never silently hidden — it remains visible to reviewers
- Suppressing without a reason (`review-ignore: HARDCODED_SECRET` alone) is rejected

See [security-floor.md](security-floor.md) for the full list of Tier 1 rule IDs.
