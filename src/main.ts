/**
 * Orchestrates setting up distrobuilder on a GitHub-hosted Linux runner.
 *
 * The flow is: guard the platform, read inputs, resolve the requested version,
 * obtain the binary (restoring from cache when possible, otherwise building from
 * source and saving the cache), install optional build dependencies, and report
 * the outputs. Every failure path is funneled through the `try/catch` into
 * `core.setFailed`, following the template convention.
 */
import * as core from '@actions/core'
import { computeCacheKey, restoreBinary, saveBinary } from './cache.js'
import { installDependencies } from './deps.js'
import { buildBinary, buildOutputPath, placeBinary } from './install.js'
import { resolveVersion } from './version.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // distrobuilder requires a Linux host; fail before any other side effect on
    // an unsupported runner.
    if (process.platform !== 'linux') {
      core.setFailed(
        `setup-distrobuilder only supports GitHub-hosted Linux runners, but this runner reports platform "${process.platform}".`
      )
      return
    }

    // Read inputs.
    const versionInput = core.getInput('version')
    const installDeps = core.getBooleanInput('install-dependencies')
    const vmDeps = core.getBooleanInput('vm-dependencies')
    const cacheEnabled = core.getBooleanInput('cache')
    const token = core.getInput('token')

    // Resolve the requested version to a concrete version and its git tag.
    const { version, tag } = await resolveVersion(versionInput, token)
    core.info(`Resolved distrobuilder version ${version} (tag ${tag}).`)

    // Obtain the binary. placeBinary is the single producer of the installed
    // path — run on both the cache-hit and cache-miss paths — so the reported
    // `path` output is always its return value.
    let installedPath: string
    let cacheHit: boolean

    if (cacheEnabled) {
      const key = computeCacheKey(version)

      if (await restoreBinary(key)) {
        core.info('Restored distrobuilder from cache.')
        installedPath = await placeBinary(buildOutputPath)
        cacheHit = true
      } else {
        core.info('No usable cache entry; building distrobuilder from source.')
        installedPath = await placeBinary(await buildBinary(tag))
        await saveBinary(key)
        cacheHit = false
      }
    } else {
      core.info('Caching disabled; building distrobuilder from source.')
      installedPath = await placeBinary(await buildBinary(tag))
      cacheHit = false
    }

    // Install the optional apt build dependencies.
    await installDependencies(installDeps, vmDeps)

    // Set outputs for later workflow steps to use.
    core.setOutput('version', version)
    core.setOutput('path', installedPath)
    core.setOutput('cache-hit', cacheHit ? 'true' : 'false')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
