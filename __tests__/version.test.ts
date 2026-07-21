/**
 * Unit tests for src/version.ts
 *
 * The module is pure, so there is nothing from `@actions/*` to mock; the only
 * external dependency is the global `fetch`, which is replaced with a jest mock
 * for each test and restored afterwards.
 */
import { jest } from '@jest/globals'
import { resolveVersion } from '../src/version.js'

const LATEST_RELEASE_URL =
  'https://api.github.com/repos/lxc/distrobuilder/releases/latest'

const originalFetch = globalThis.fetch
const fetchMock = jest.fn<typeof fetch>()

/**
 * Builds a minimal `Response` stand-in exposing only the `status` and `json`
 * members that the module under test reads.
 */
function mockResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body
  } as unknown as Response
}

describe('version.ts', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('latest', () => {
    it('reads tag_name from the releases API', async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { tag_name: 'v3.3.1' }))

      const result = await resolveVersion('latest', 'secret-token')

      expect(result).toEqual({ version: '3.3.1', tag: 'v3.3.1' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(LATEST_RELEASE_URL, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'meigma/setup-distrobuilder',
          authorization: 'Bearer secret-token'
        }
      })
    })

    it('omits the authorization header when the token is empty', async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { tag_name: 'v3.3.1' }))

      await resolveVersion('latest', '')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const options = fetchMock.mock.calls[0][1]
      expect(options?.headers).toEqual({
        accept: 'application/vnd.github+json',
        'user-agent': 'meigma/setup-distrobuilder'
      })
    })

    it('rejects when the API responds with a non-200 status', async () => {
      fetchMock.mockResolvedValue(mockResponse(403, {}))

      await expect(resolveVersion('latest', 'token')).rejects.toThrow('403')
    })

    it('rejects when the response has no tag_name', async () => {
      fetchMock.mockResolvedValue(mockResponse(200, {}))

      await expect(resolveVersion('latest', 'token')).rejects.toThrow(
        /tag_name/
      )
    })

    it('rejects when tag_name is malformed', async () => {
      fetchMock.mockResolvedValue(
        mockResponse(200, { tag_name: 'not-a-version' })
      )

      await expect(resolveVersion('latest', 'token')).rejects.toThrow(
        /tag_name/
      )
    })
  })

  describe('explicit version', () => {
    it('resolves a full version without a leading v', async () => {
      const result = await resolveVersion('3.3.1', '')

      expect(result).toEqual({ version: '3.3.1', tag: 'v3.3.1' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('resolves a full version with a leading v', async () => {
      const result = await resolveVersion('v3.3.1', '')

      expect(result).toEqual({ version: '3.3.1', tag: 'v3.3.1' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('accepts a two-part MAJOR.MINOR version', async () => {
      const result = await resolveVersion('3.3', '')

      expect(result).toEqual({ version: '3.3', tag: 'v3.3' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each(['abc', '3', '', 'v', '3.3.1.1'])(
      'rejects the malformed input %p',
      async (spec) => {
        await expect(resolveVersion(spec, '')).rejects.toThrow()
        expect(fetchMock).not.toHaveBeenCalled()
      }
    )
  })
})
