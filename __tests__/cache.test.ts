/**
 * Unit tests for src/cache.ts
 *
 * `@actions/cache` is mocked through the new `__fixtures__/cache.ts` fixture and
 * `@actions/core` through the shared `__fixtures__/core.ts` fixture, both wired
 * with `jest.unstable_mockModule` before the module under test is dynamically
 * imported. `@actions/exec` is mocked too: importing `../src/cache.js`
 * transitively loads `../src/install.js`, which imports `@actions/exec`. The
 * `ImageOS` and `RUNNER_ARCH` environment variables are pinned in `beforeEach`
 * so key composition is deterministic, and restored in `afterEach`.
 */
import { jest } from '@jest/globals'
import * as cache from '../__fixtures__/cache.js'
import * as core from '../__fixtures__/core.js'
import * as exec from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/cache', () => cache)
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => exec)

const { computeCacheKey, restoreBinary, saveBinary } =
  await import('../src/cache.js')
const { buildOutputPath } = await import('../src/install.js')

const IMAGE_OS = 'ubuntu24'
const RUNNER_ARCH = 'X64'
const VERSION = '3.3.1'
const KEY = 'distrobuilder-ubuntu24-X64-3.3.1'

const originalImageOs = process.env.ImageOS
const originalRunnerArch = process.env.RUNNER_ARCH

describe('cache.ts', () => {
  beforeEach(() => {
    process.env.ImageOS = IMAGE_OS
    process.env.RUNNER_ARCH = RUNNER_ARCH
  })

  afterEach(() => {
    if (originalImageOs === undefined) {
      delete process.env.ImageOS
    } else {
      process.env.ImageOS = originalImageOs
    }

    if (originalRunnerArch === undefined) {
      delete process.env.RUNNER_ARCH
    } else {
      process.env.RUNNER_ARCH = originalRunnerArch
    }
  })

  describe('computeCacheKey', () => {
    it('composes the key from ImageOS, RUNNER_ARCH, and the version', () => {
      expect(computeCacheKey(VERSION)).toBe(KEY)
    })

    it('throws naming ImageOS when it is unset', () => {
      delete process.env.ImageOS

      expect(() => computeCacheKey(VERSION)).toThrow(/ImageOS/)
    })

    it('throws naming RUNNER_ARCH when it is unset', () => {
      delete process.env.RUNNER_ARCH

      expect(() => computeCacheKey(VERSION)).toThrow(/RUNNER_ARCH/)
    })
  })

  describe('restoreBinary', () => {
    it('returns true on an exact-key hit', async () => {
      cache.restoreCache.mockResolvedValue(KEY)

      const result = await restoreBinary(KEY)

      expect(result).toBe(true)

      // Restore is called with exactly the build output path and the key, and
      // nothing more: no restoreKeys argument, which is the exact-key guarantee.
      expect(cache.restoreCache).toHaveBeenCalledWith([buildOutputPath], KEY)
      expect(cache.restoreCache.mock.calls[0]).toHaveLength(2)
    })

    it('returns false on a miss', async () => {
      cache.restoreCache.mockResolvedValue(undefined)

      await expect(restoreBinary(KEY)).resolves.toBe(false)
    })

    it('resolves false and warns when restore rejects, without throwing', async () => {
      cache.restoreCache.mockRejectedValue(new Error('restore boom'))

      await expect(restoreBinary(KEY)).resolves.toBe(false)
      expect(core.warning).toHaveBeenCalled()
    })
  })

  describe('saveBinary', () => {
    it('saves the build output path under the key', async () => {
      cache.saveCache.mockResolvedValue(0)

      await saveBinary(KEY)

      expect(cache.saveCache).toHaveBeenCalledWith([buildOutputPath], KEY)
    })

    it('resolves without throwing and warns when save rejects', async () => {
      cache.saveCache.mockRejectedValue(new Error('save boom'))

      await expect(saveBinary(KEY)).resolves.toBeUndefined()
      expect(core.warning).toHaveBeenCalled()
    })
  })
})
