# Technical Notes

- v1 (1.0.0) is implemented and released via release-please. The v1
  design/plan docs were removed post-release (e04f0e9; git history has
  them). Draft release v1.0.0 awaits human publish — publishing fires
  major-version-tag.yml and creates the `v1` major tag; `@v1` is not
  resolvable until then.
- CI gate is `moon run root:check` (format-check, lint, test, check-dist,
  audit); run it in the worktree before proposing any commit. New worktrees
  need `mise trust` (both worktree and repo root) before `mise install`.
- `.session.md`, `AGENTS.md`, `CLAUDE.md` are in `.prettierignore` on purpose:
  framework-owned, reinstalled verbatim from `~/code/ai`. Never reformat them.
- distrobuilder install facts (verified 2026-07-20): no prebuilt release
  binaries; snap can't pin versions; build from source via upstream `make`;
  binary must run under sudo, hence install to `/usr/local/bin` (on
  `secure_path`).
- Release credentials are REPO-level: `MEIGMA_RELEASE_APP_ID` variable +
  `MEIGMA_RELEASE_APP_PRIVATE_KEY` secret, sourced from 1Password item
  `meigma-release-please` (Meigma vault: `app_id`/`client_id` fields,
  `key.pem` attachment). The org-level access-list route was never needed.
- API merges of PRs touching `.github/workflows/` need a `workflow`-scoped
  token; the local gh token and the release app (no `workflows` permission)
  both lack it. Use `@dependabot squash and merge` (works, ~15 min latency;
  rebase/ignore commands act fast) or the web UI.
- Dependabot's typescript 7.x major is ignored (PR #4): typescript-eslint,
  ts-jest, and @rollup/plugin-typescript all hard-fail on TS 7. Revisit when
  they publish TS-7-compatible releases.
