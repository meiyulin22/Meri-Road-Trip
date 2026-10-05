# Meri Agent Instructions

## Required context

Read and follow at the start of a task:

- `docs/PROJECT.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_PRINCIPLES.md`

Read sections 1–5 of `docs/CODEBASE_GUIDE.md` for the directory map, current
architecture boundaries, and task-specific reading paths. Use its file inventory
as an index: read the relevant source and tests before editing, rather than loading
every file or assuming a filename proves runtime behavior.

For changes to user interactions, API behavior, state, persistence, or conversation,
also read the relevant sections of `docs/USER_FLOW_CURRENT.md`. This is detailed
user-facing explanation material: preserve its chapters, operation-to-code mappings,
data changes, APIs, error paths, and concurrency boundaries. Do not replace it with
a brief overview.

For agent work — anything in `src/agents/`, or Generate plan — also read
`src/agents/README.md`, the agents' design contract: what runs today, what is
planned, the tools, budgets, validation rules, and what the live trials found.

For database schema, repository, or migration work, also read
`docs/DATABASE_SCHEMA.md` for the table/field directory, relationships, constraints,
and code mappings. Keep it consistent with the actual schema and migration files.

`docs/product/adaptive-workspace.md` describes future direction, not an implementation
requirement. `docs/product/companion-bear.md` is the bear's design reference; its sprites and
behaviour are implemented in `src/components/companion/`, and its open items are not tasks. Historical plans in Git are not the current behavior contract.

## Working rules

Work incrementally.

Only implement the scope requested in the current task.
Do not proactively implement future architecture.

- Check `git status` and both staged and unstaged diffs before editing. Preserve
  existing work; do not reset, overwrite, or revert unrelated user changes.
- Current TripState is authoritative. Suggestions and historical messages do not
  silently become saved destinations or restore removed places.
- Preserve province → city/prefecture → spot preferences, explicit selection,
  cascading deletion that retains an empty province, and read-only consumed/expired
  cards. Generate plan currently checks readiness only.
- Keep source, tests, and affected current documentation consistent. Update the file
  inventory when adding, moving, or removing project files; do not create speculative
  layers or directory-level instruction files before they are needed.
- Follow the validation checklist in `docs/CODING_PRINCIPLES.md`. Report checks
  actually run and any limitations; never describe planned capabilities as implemented.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
