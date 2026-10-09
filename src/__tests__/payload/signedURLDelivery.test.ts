import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { createLocalReq, type CollectionConfig } from 'payload'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const uploadCollection = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  fields: [],
})

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]

describe('signed-URL endpoint delivers private files', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [uploadCollection('media'), uploadCollection('legacy')],
      pluginCollections: {
        media: { privateFiles: true },
        legacy: { privateFiles: { enabled: true, expiresIn: 60, authToken: true } as any },
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const uploadPrivate = async (collection: string, filename: string) => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    const call = harness.cloudinary.calls.find(
      (c) => c.method === 'upload_stream' && c.result.public_id === doc.cloudinaryPublicId,
    )
    return { doc, call: call!, version: call!.result.version as number }
  }

  const privateURL = (publicId: string, version: number, flags = '') =>
    new RegExp(`^${BASE}/authenticated/s--[\\w-]{8}--/${flags}v${version}/${publicId}\\.png$`)

  it('returns a signed authenticated URL with the version and no token', async () => {
    const { doc, version } = await uploadPrivate('media', 'endpoint.png')

    const res = await harness.request(`/api/media/signed-url/${doc.id}`, { user })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(pathOf(body.url)).toMatch(privateURL(doc.cloudinaryPublicId, version))
    expect(body.url).not.toContain('__cld_token__')
  })

  it('returns a signed authenticated download URL', async () => {
    const { doc, version } = await uploadPrivate('media', 'download.png')

    const res = await harness.request(`/api/media/signed-url/${doc.id}?download=true`, { user })
    const body = await res.json()

    expect(pathOf(body.downloadUrl)).toMatch(
      privateURL(doc.cloudinaryPublicId, version, 'fl_attachment:download/'),
    )
  })

  it('does not promise an expiry', async () => {
    const { doc } = await uploadPrivate('media', 'no-expiry.png')

    const single = await (await harness.request(`/api/media/signed-url/${doc.id}`, { user })).json()
    const batch = await (
      await harness.request('/api/media/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [String(doc.id)] }),
        user,
      })
    ).json()

    for (const result of [single, batch.results[0]]) {
      expect(result.url).toBeTruthy()
      expect(result).not.toHaveProperty('expiresIn')
      expect(result).not.toHaveProperty('expiresAt')
    }
  })

  it('ignores the deprecated authToken and expiresIn settings', async () => {
    const { doc, version } = await uploadPrivate('legacy', 'legacy.png')

    const res = await harness.request(`/api/legacy/signed-url/${doc.id}`, { user })
    const body = await res.json()

    expect(pathOf(body.url)).toMatch(privateURL(doc.cloudinaryPublicId, version))
    expect(body.url).not.toContain('__cld_token__')
    expect(body.url).not.toContain('exp=')
  })

  it('uploads as authenticated with no expiry or token despite the deprecated settings', async () => {
    const { doc: legacyDoc, call: legacyCall } = await uploadPrivate('legacy', 'legacy-upload.png')
    const { doc: mediaDoc, call: mediaCall } = await uploadPrivate('media', 'media-upload.png')

    for (const call of [legacyCall, mediaCall]) {
      expect(call.options.type).toBe('authenticated')
      for (const key of ['expires_at', 'expiresIn', 'expires_in', 'auth_token', 'authToken']) {
        expect(call.options).not.toHaveProperty(key)
      }
    }
    // The deprecated settings add no upload option the plain private collection lacks.
    expect(Object.keys(legacyCall.options).sort()).toEqual(Object.keys(mediaCall.options).sort())

    // Reading the stored row is a trusted check, so it skips access on purpose.
    const req = await createLocalReq({}, harness.payload)
    const readLegacy = await harness.payload.findByID({
      collection: 'legacy',
      id: legacyDoc.id,
      req,
      overrideAccess: true,
    })
    const readMedia = await harness.payload.findByID({
      collection: 'media',
      id: mediaDoc.id,
      req,
      overrideAccess: true,
    })
    expect(readLegacy.cloudinaryType).toBe('authenticated')
    expect(readMedia.cloudinaryType).toBe('authenticated')
  })
})

describe('deprecated authToken and expiresIn', () => {
  let harness: PayloadHarness | undefined
  let warn: MockInstance<typeof console.warn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    await harness?.stop()
    harness = undefined
    warn.mockRestore()
  })

  const deprecationWarnings = () =>
    warn.mock.calls.filter((args) => String(args[0]).includes('deprecated'))

  it('logs one warning at startup that names each setting and collection', async () => {
    harness = await startPayload({
      collections: [uploadCollection('media'), uploadCollection('files')],
      pluginCollections: {
        media: { privateFiles: { enabled: true, expiresIn: 60 } },
        files: { signedURLs: { enabled: true, authToken: true } as any },
      },
    })

    const warnings = deprecationWarnings()
    expect(warnings).toHaveLength(1)
    const message = String(warnings[0][0])
    expect(message).toContain('expiresIn')
    expect(message).toContain('authToken')
    expect(message).toContain('media')
    expect(message).toContain('files')
  })

  it('logs nothing when neither setting is used', async () => {
    harness = await startPayload({
      pluginCollections: { media: { privateFiles: true } },
    })

    expect(deprecationWarnings()).toHaveLength(0)
  })
})
