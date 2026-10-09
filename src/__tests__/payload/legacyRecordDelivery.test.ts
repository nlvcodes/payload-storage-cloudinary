import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq } from 'payload'
import { getSignedURL } from '../../helpers/serverHelpers'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]
const pluginCollections = { media: { privateFiles: true } }

// A record from before 1.3.0 has no `cloudinaryType`, and a private one may live as `upload`.
describe('URL helpers read the delivery type from the stored record', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({ pluginCollections })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const uploadPrivate = async (filename: string) => {
    const res = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload(filename),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    const call = harness.cloudinary.calls.find(
      (c) => c.method === 'upload_stream' && c.result.public_id === doc.cloudinaryPublicId,
    )
    return { doc, version: call!.result.version as number }
  }

  // Rewrites the stored fields the way a 1.2.x private upload left them, without running hooks.
  const uploadLegacyPrivate = async (filename: string) => {
    const { doc, version } = await uploadPrivate(filename)
    const req = await createLocalReq({}, harness.payload)
    await harness.payload.db.updateOne({
      collection: 'media',
      id: doc.id,
      data: {
        cloudinaryType: null,
        originalUrl: `${BASE}/upload/v${version}/${doc.cloudinaryPublicId}.png`,
      },
      req,
    })
    return { doc, version }
  }

  const authenticatedURL = (publicId: string, version: number) =>
    new RegExp(`^${BASE}/authenticated/s--[\\w-]{8}--/v${version}/${publicId}\\.png$`)

  describe('signed-URL endpoint', () => {
    it('returns an unsigned upload URL for a legacy record stored as upload', async () => {
      const { doc, version } = await uploadLegacyPrivate('legacy-endpoint.png')

      const res = await harness.request(`/api/media/signed-url/${doc.id}`, { user })
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(pathOf(body.url)).toBe(`${BASE}/upload/v${version}/${doc.cloudinaryPublicId}.png`)
    })

    it('returns an unsigned upload download URL for a legacy record stored as upload', async () => {
      const { doc, version } = await uploadLegacyPrivate('legacy-download.png')

      const res = await harness.request(`/api/media/signed-url/${doc.id}?download=true`, { user })
      const body = await res.json()

      expect(pathOf(body.downloadUrl)).toBe(
        `${BASE}/upload/fl_attachment:legacy-download/v${version}/${doc.cloudinaryPublicId}.png`,
      )
    })

    it('returns an unsigned upload URL for a legacy record in a batch', async () => {
      const { doc, version } = await uploadLegacyPrivate('legacy-batch.png')

      const res = await harness.request('/api/media/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [String(doc.id)] }),
        user,
      })
      const body = await res.json()

      expect(pathOf(body.results[0].url)).toBe(
        `${BASE}/upload/v${version}/${doc.cloudinaryPublicId}.png`,
      )
    })
  })

  describe('getSignedURL server helper', () => {
    // The helper enforces access, so it runs as the logged-in user that uploaded the file
    const asUser = async () => createLocalReq({ user: await harness.userOf(user) }, harness.payload)

    it('returns a signed authenticated URL for a private record', async () => {
      const { doc, version } = await uploadPrivate('server.png')

      const url = await getSignedURL({
        payload: harness.payload,
        collection: 'media',
        docId: String(doc.id),
        req: await asUser(),
      })

      expect(pathOf(url!)).toMatch(authenticatedURL(doc.cloudinaryPublicId, version))
      expect(url).not.toContain('__cld_token__')
    })

    it('returns an unsigned upload URL for a legacy record stored as upload', async () => {
      const { doc, version } = await uploadLegacyPrivate('server-legacy.png')

      const url = await getSignedURL({
        payload: harness.payload,
        collection: 'media',
        docId: String(doc.id),
        req: await asUser(),
      })

      expect(pathOf(url!)).toBe(`${BASE}/upload/v${version}/${doc.cloudinaryPublicId}.png`)
    })
  })
})
