# Changelog

## Unreleased

### Added
- `action.yml` composite action — correct `uses: stephengolub/code-reviewer@v1` step syntax
- Phase 0A: structured PR review prompt covering quality, security, test co-location,
  and boilerplate collapse
- README with 5-minute adoption guide
- `docs/configuration.md` covering all Action inputs, secrets, and workflow options

### Fixed
- Workflow was incorrectly structured as a reusable workflow instead of a composite
  action; converted to `action.yml` so `uses: stephengolub/code-reviewer@v1` works
  correctly as a step
