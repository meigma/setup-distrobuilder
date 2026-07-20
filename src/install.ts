/**
 * Source build and installation of the distrobuilder binary.
 *
 * distrobuilder ships no prebuilt binaries, so the action builds it from source
 * with the upstream Makefile (which sets the required build tags and runs
 * `go install`) and then installs the result where both the normal `PATH` and
 * sudo's `secure_path` can reach it. The build and the install are split so the
 * install step can be reused on a cache hit, where the binary is restored rather
 * than rebuilt.
 */
import { rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { exec } from '@actions/exec'

/**
 * Absolute path to the binary produced by the source build.
 *
 * The upstream Makefile go-installs distrobuilder to `~/go/bin`, which resolves
 * to `/home/runner/go/bin/distrobuilder` on GitHub-hosted runners. This is the
 * single definition of that path; the caching module and the orchestrator import
 * it so the install and cache code always agree. It is resolved to an absolute
 * path via `os.homedir()` rather than a literal `~`, because neither
 * `@actions/exec` (which does not run through a shell) nor `@actions/cache`
 * (which globs paths) expands a tilde.
 */
export const buildOutputPath = path.join(os.homedir(), 'go/bin/distrobuilder')

/** Public URL of the distrobuilder source repository. */
const SOURCE_REPO = 'https://github.com/lxc/distrobuilder'

/** Absolute path the binary is installed to for use under `PATH` and sudo. */
const INSTALL_PATH = '/usr/local/bin/distrobuilder'

/**
 * Clones distrobuilder at the given tag and builds it from source.
 *
 * The clone directory (`$RUNNER_TEMP/distrobuilder-src`) is removed first so a
 * second build in the same job — legitimate because a cache save failure is
 * non-fatal — does not trip on a leftover clone. The build uses the upstream
 * Makefile, which sets the required build tags and go-installs the binary to the
 * build output path, so the action never has to track those build tags itself.
 *
 * @param tag The git tag to build, e.g. `v3.3.1`.
 * @returns The build output path, where the compiled binary now lives.
 */
export async function buildBinary(tag: string): Promise<string> {
  const cloneDir = path.join(
    process.env.RUNNER_TEMP ?? os.tmpdir(),
    'distrobuilder-src'
  )

  await rm(cloneDir, { recursive: true, force: true })
  await exec('git', [
    'clone',
    '--depth',
    '1',
    '--branch',
    tag,
    SOURCE_REPO,
    cloneDir
  ])
  await exec('make', [], { cwd: cloneDir })

  return buildOutputPath
}

/**
 * Installs a built distrobuilder binary to `/usr/local/bin`.
 *
 * Runs `sudo install` so the binary is owned by root and reachable under both
 * the normal `PATH` and sudo's `secure_path`. This is reused on the cache-hit
 * path with the restored binary at the build output path, so the `sudo install`
 * lives in exactly one place and the reported `path` output is always this
 * function's return value.
 *
 * @param sourcePath Path to the built binary to install.
 * @returns The install path, `/usr/local/bin/distrobuilder`.
 */
export async function placeBinary(sourcePath: string): Promise<string> {
  await exec('sudo', ['install', '-m', '0755', sourcePath, INSTALL_PATH])

  return INSTALL_PATH
}
