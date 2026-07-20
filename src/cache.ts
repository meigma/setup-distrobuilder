/**
 * Cache-key composition and restore/save wrappers for the distrobuilder binary.
 *
 * What is cached is the runner-user-owned build output at `buildOutputPath`
 * (imported from the install module so the install and cache code always agree),
 * not the root-owned `/usr/local/bin` copy. Restore uses exact-key matching only
 * — no `restore-keys` — so a build for one version or OS can never be restored
 * for another. Cache restore and save failures are non-fatal by design: they are
 * surfaced as warnings and the action falls back to building from source.
 */
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import { buildOutputPath } from './install.js'

/**
 * Composes the cache key for a resolved distrobuilder version.
 *
 * The key is `distrobuilder-<ImageOS>-<RUNNER_ARCH>-<version>`. The binary
 * dynamically links glibc, so the OS image (`ImageOS`, e.g. `ubuntu24`, which
 * distinguishes 22.04 from 24.04) and architecture (`RUNNER_ARCH`, e.g. `X64`)
 * must be part of the key; the version pins the exact build.
 *
 * Both environment variables are set on GitHub-hosted runners. A missing value
 * is possible only outside them (for example a self-hosted Linux runner), so
 * this throws a descriptive error naming the missing variable; that error is
 * fatal through the orchestrator's try/catch → `setFailed`, and such
 * environments can still use the action with `cache: false`.
 *
 * @param version The resolved distrobuilder version, e.g. `3.3.1`.
 * @returns The composed cache key.
 */
export function computeCacheKey(version: string): string {
  const imageOs = process.env.ImageOS

  if (imageOs === undefined || imageOs === '') {
    throw new Error(
      'The ImageOS environment variable is unset; it is required to compute the cache key. This is expected only outside GitHub-hosted runners, where the action can still be used with cache: false.'
    )
  }

  const runnerArch = process.env.RUNNER_ARCH

  if (runnerArch === undefined || runnerArch === '') {
    throw new Error(
      'The RUNNER_ARCH environment variable is unset; it is required to compute the cache key. This is expected only outside GitHub-hosted runners, where the action can still be used with cache: false.'
    )
  }

  return `distrobuilder-${imageOs}-${runnerArch}-${version}`
}

/**
 * Restores the compiled binary from cache under an exact key.
 *
 * No `restoreKeys` are passed, so only an exact-key match is a hit — a build for
 * one version or OS can never be restored for another. A restore failure is
 * non-fatal: it is logged as a warning and treated as a miss so the action falls
 * back to building from source.
 *
 * @param key The exact cache key to restore.
 * @returns `true` on an exact-key hit, `false` on a miss or a restore failure.
 */
export async function restoreBinary(key: string): Promise<boolean> {
  try {
    const restoredKey = await cache.restoreCache([buildOutputPath], key)

    return restoredKey === key
  } catch (error) {
    core.warning(
      `Failed to restore the distrobuilder cache; building from source instead: ${
        error instanceof Error ? error.message : String(error)
      }`
    )

    return false
  }
}

/**
 * Saves the compiled binary to cache under the given key.
 *
 * A save failure is non-fatal: it is logged as a warning and swallowed, never
 * thrown, so a cache problem cannot fail an otherwise successful run.
 *
 * @param key The cache key to save under.
 */
export async function saveBinary(key: string): Promise<void> {
  try {
    await cache.saveCache([buildOutputPath], key)
  } catch (error) {
    core.warning(
      `Failed to save the distrobuilder cache: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
