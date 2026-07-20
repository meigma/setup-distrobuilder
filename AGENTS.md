# Agent Instructions

- Read [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) first.
- Tooling is pinned by mise (`mise install`); tasks run through moon.
- The CI gate is `moon run root:check` — it must pass before any commit is
  proposed for review.
- The bundled action `dist/` is committed: after changing `src/`, run
  `moon run root:package` and commit the refreshed `dist/` in the same change.
- Use Conventional Commit subjects; releases are automated by release-please.
