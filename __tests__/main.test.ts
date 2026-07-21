/**
 * Unit tests for the orchestration in src/main.ts.
 *
 * Every collaborator is mocked: the four action modules (`version`, `install`,
 * `cache`, `deps`) through local `jest.fn`s and `@actions/core` through the
 * shared `__fixtures__/core.ts` fixture, all wired with
 * `jest.unstable_mockModule` before `../src/main.js` is dynamically imported.
 * `process.platform` is stubbed per test with `Object.defineProperty` (defaulting
 * to `linux`) and the real descriptor is restored in `afterEach`.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

const resolveVersion =
  jest.fn<typeof import('../src/version.js').resolveVersion>()
const buildBinary = jest.fn<typeof import('../src/install.js').buildBinary>()
const placeBinary = jest.fn<typeof import('../src/install.js').placeBinary>()
const computeCacheKey =
  jest.fn<typeof import('../src/cache.js').computeCacheKey>()
const restoreBinary = jest.fn<typeof import('../src/cache.js').restoreBinary>()
const saveBinary = jest.fn<typeof import('../src/cache.js').saveBinary>()
const installDependencies =
  jest.fn<typeof import('../src/deps.js').installDependencies>()

// The exported build output path from src/install.ts; run() must forward exactly
// this constant to placeBinary on the cache-hit path.
const BUILD_OUTPUT_PATH = '/home/runner/go/bin/distrobuilder'
// A distinct sentinel standing in for buildBinary()'s return value, so a test
// can prove run() forwards *that* value (not BUILD_OUTPUT_PATH) to placeBinary
// on the cache-miss path.
const BUILT_PATH = '/home/runner/go/bin/distrobuilder#built'
const INSTALL_PATH = '/usr/local/bin/distrobuilder'
const VERSION = '3.3.1'
const TAG = 'v3.3.1'
const KEY = 'distrobuilder-ubuntu24-X64-3.3.1'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/version.js', () => ({ resolveVersion }))
jest.unstable_mockModule('../src/install.js', () => ({
  buildOutputPath: BUILD_OUTPUT_PATH,
  buildBinary,
  placeBinary
}))
jest.unstable_mockModule('../src/cache.js', () => ({
  computeCacheKey,
  restoreBinary,
  saveBinary
}))
jest.unstable_mockModule('../src/deps.js', () => ({ installDependencies }))

const { run } = await import('../src/main.js')

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

/** Stubs `process.platform` for the duration of a test. */
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

/** Configures `core.getBooleanInput` to return the given input values. */
function mockBooleanInputs({
  cache = true,
  install = true,
  vm = false
}: {
  cache?: boolean
  install?: boolean
  vm?: boolean
}): void {
  core.getBooleanInput.mockImplementation((name: string) => {
    switch (name) {
      case 'cache':
        return cache
      case 'install-dependencies':
        return install
      case 'vm-dependencies':
        return vm
      default:
        return false
    }
  })
}

describe('main.ts', () => {
  beforeEach(() => {
    setPlatform('linux')

    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'version':
          return 'latest'
        case 'token':
          return 'test-token'
        default:
          return ''
      }
    })
    mockBooleanInputs({})

    resolveVersion.mockResolvedValue({ version: VERSION, tag: TAG })
    computeCacheKey.mockReturnValue(KEY)
    restoreBinary.mockResolvedValue(false)
    saveBinary.mockResolvedValue(undefined)
    buildBinary.mockResolvedValue(BUILT_PATH)
    placeBinary.mockResolvedValue(INSTALL_PATH)
    installDependencies.mockResolvedValue(undefined)
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
    jest.resetAllMocks()
  })

  it('restores from cache on a hit and skips building and saving', async () => {
    restoreBinary.mockResolvedValue(true)

    await run()

    // The key is computed from the resolved version and used to restore.
    expect(computeCacheKey).toHaveBeenCalledWith(VERSION)
    expect(restoreBinary).toHaveBeenCalledWith(KEY)

    // placeBinary runs with the exported build output path; no build, no save.
    expect(placeBinary).toHaveBeenCalledWith(BUILD_OUTPUT_PATH)
    expect(buildBinary).not.toHaveBeenCalled()
    expect(saveBinary).not.toHaveBeenCalled()

    // Outputs reflect the resolved version, the installed path, and a hit.
    expect(core.setOutput).toHaveBeenCalledWith('version', VERSION)
    expect(core.setOutput).toHaveBeenCalledWith('path', INSTALL_PATH)
    expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'true')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('builds from source on a miss, places the built binary, and saves', async () => {
    restoreBinary.mockResolvedValue(false)

    await run()

    // The build runs against the resolved tag.
    expect(buildBinary).toHaveBeenCalledWith(TAG)

    // placeBinary runs with buildBinary's return value, not the exported path.
    expect(placeBinary).toHaveBeenCalledWith(BUILT_PATH)

    // The cache is saved under the computed key.
    expect(saveBinary).toHaveBeenCalledWith(KEY)

    // Outputs reflect a build (cache miss).
    expect(core.setOutput).toHaveBeenCalledWith('version', VERSION)
    expect(core.setOutput).toHaveBeenCalledWith('path', INSTALL_PATH)
    expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'false')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('skips the cache entirely when caching is disabled', async () => {
    mockBooleanInputs({ cache: false })

    await run()

    // No cache work at all: no key, no restore, no save.
    expect(computeCacheKey).not.toHaveBeenCalled()
    expect(restoreBinary).not.toHaveBeenCalled()
    expect(saveBinary).not.toHaveBeenCalled()

    // It still builds and places, and reports a miss.
    expect(buildBinary).toHaveBeenCalledWith(TAG)
    expect(placeBinary).toHaveBeenCalledWith(BUILT_PATH)
    expect(core.setOutput).toHaveBeenCalledWith('path', INSTALL_PATH)
    expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'false')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it.each([
    { install: true, vm: false },
    { install: true, vm: true },
    { install: false, vm: true },
    { install: false, vm: false }
  ])(
    'forwards the dependency inputs to installDependencies (install=$install, vm=$vm)',
    async ({ install, vm }) => {
      mockBooleanInputs({ install, vm })

      await run()

      expect(installDependencies).toHaveBeenCalledWith(install, vm)
    }
  )

  it('fails before any other side effect on a non-Linux runner', async () => {
    setPlatform('win32')

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Linux')
    )

    // No orchestration runs on an unsupported platform.
    expect(resolveVersion).not.toHaveBeenCalled()
    expect(buildBinary).not.toHaveBeenCalled()
    expect(placeBinary).not.toHaveBeenCalled()
    expect(installDependencies).not.toHaveBeenCalled()
    expect(core.setOutput).not.toHaveBeenCalled()
  })

  it('surfaces a thrown error through setFailed', async () => {
    resolveVersion.mockRejectedValueOnce(
      new Error('Failed to query the distrobuilder releases API: HTTP 403.')
    )

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to query the distrobuilder releases API: HTTP 403.'
    )
    expect(buildBinary).not.toHaveBeenCalled()
    expect(placeBinary).not.toHaveBeenCalled()
  })
})
