/**
 * Version resolution for the distrobuilder release to install.
 *
 * This module is pure: it performs no `@actions/*` work and throws a descriptive
 * `Error` on every failure path, leaving the orchestrator's `try/catch` to
 * surface it through `core.setFailed`.
 */

/** GitHub releases API endpoint for the latest distrobuilder release. */
const LATEST_RELEASE_URL =
  'https://api.github.com/repos/lxc/distrobuilder/releases/latest'

/** User agent sent to the GitHub API, which rejects requests that lack one. */
const USER_AGENT = 'meigma/setup-distrobuilder'

/** Accepted shape of a version number: `MAJOR.MINOR[.PATCH]`. */
const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/

/** Accepted shape of a release tag: `MAJOR.MINOR[.PATCH]` with an optional `v`. */
const TAG_PATTERN = /^v?\d+\.\d+(\.\d+)?$/

/**
 * Resolves a version spec to the concrete distrobuilder version and git tag.
 *
 * `latest` queries the distrobuilder releases API; an explicit value such as
 * `3.3.1` (or `v3.3.1`) is normalized without a network call.
 *
 * @param spec The `version` input: `latest` or an explicit `MAJOR.MINOR[.PATCH]`
 *   value (a leading `v` is accepted).
 * @param token GitHub token used to authenticate the releases API request when
 *   resolving `latest`; an empty string sends no `authorization` header.
 * @returns The resolved `version` (e.g. `3.3.1`) and git `tag` (e.g. `v3.3.1`).
 */
export async function resolveVersion(
  spec: string,
  token: string
): Promise<{ version: string; tag: string }> {
  const trimmed = spec.trim()

  if (trimmed === 'latest') {
    return resolveLatest(token)
  }

  return resolveExplicit(trimmed)
}

/**
 * Resolves an explicit version spec without contacting the network.
 *
 * @param spec The trimmed `version` input.
 * @returns The normalized `version` and its `v`-prefixed git `tag`.
 */
function resolveExplicit(spec: string): { version: string; tag: string } {
  const version = spec.replace(/^v/, '')

  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `Invalid version "${spec}": expected "latest" or a MAJOR.MINOR[.PATCH] version such as "3.3.1".`
    )
  }

  return { version, tag: `v${version}` }
}

/**
 * Resolves `latest` by reading `tag_name` from the distrobuilder releases API.
 *
 * @param token GitHub token; when non-empty it is sent as a `Bearer` credential.
 * @returns The resolved `version` and the `tag` exactly as the API reported it.
 */
async function resolveLatest(
  token: string
): Promise<{ version: string; tag: string }> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT
  }

  if (token !== '') {
    headers.authorization = `Bearer ${token}`
  }

  const response = await fetch(LATEST_RELEASE_URL, { headers })

  if (response.status !== 200) {
    throw new Error(
      `Failed to query the distrobuilder releases API: HTTP ${response.status}.`
    )
  }

  const body = (await response.json()) as { tag_name?: unknown }
  const tag = body.tag_name

  if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) {
    throw new Error(
      `The distrobuilder releases API returned an unusable tag_name: ${JSON.stringify(tag)}.`
    )
  }

  return { version: tag.replace(/^v/, ''), tag }
}
