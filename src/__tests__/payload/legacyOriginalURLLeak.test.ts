import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPayloadRequest, type CollectionConfig } from 'payload'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

// Anyone reads the document.
const readable = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  access: { read: () => true },
  fields: [],
})

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`

// Every Cloudinary URL anywhere in a response body, nested groups included.
const cloudinaryURLs = (value: unknown): string[] => {
  if (typeof value === 'string') return value.includes('res.cloudinary.com') ? [value] : []
  if (value && typeof value === 'object') return Object.values(value).flatMap(cloudinaryURLs)
  return []
}

describe('an unmigrated 1.x private row', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [readable('gallery')],
      // The preview is on with no customAuthCheck, so nobody gets the original
      pluginCollections: {
        gallery: {
          privateFiles: true,
          transformations: { preserveOriginal: true, publicTransformation: { enabled: true } },
        },
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('gives a reader without the original no unsigned URL', async () => {
    const res = await harness.request('/api/gallery', {
      method: 'POST',
      body: pngUpload('legacy-leak.png'),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()

    // A 1.2.x private upload: stored as `upload`, with its permanent URL in `originalUrl`,
    // which 2.0 reads as `original.url` on SQL.
    const legacyURL = `${BASE}/upload/v1/${doc.cloudinaryPublicId}.png`
    await harness.payload.db.updateOne({
      collection: 'gallery',
      id: doc.id,
      // A row from before v4 has no `original.filename`
      data: { cloudinaryType: null, original: { filename: null, url: legacyURL } },
      req: await createPayloadRequest({ payload: harness.payload }),
    })

    const read = await harness.request(`/api/gallery/${doc.id}`, {})
    expect(read.status).toBe(200)

    const body = await read.json()
    expect(cloudinaryURLs(body).filter((url) => url.includes('/upload/'))).toEqual([])
  })

  it('clears the stored original URL when a 1.x public row is made private', async () => {
    const res = await harness.request('/api/gallery', {
      method: 'POST',
      body: pngUpload('legacy-public.png', { isPrivate: false }),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()

    // A 1.x public row: its permanent URL in `originalUrl`, which 2.0 reads as `original.url`
    const legacyURL = `${BASE}/upload/v1/${doc.cloudinaryPublicId}.png`
    await harness.payload.db.updateOne({
      collection: 'gallery',
      id: doc.id,
      data: { cloudinaryType: 'upload', original: { filename: null, url: legacyURL } },
      req: await createPayloadRequest({ payload: harness.payload }),
    })

    const updated = await harness.request(`/api/gallery/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPrivate: true }),
      user,
    })
    expect(updated.status).toBe(200)

    const row = await harness.payload.db.findOne<Record<string, any>>({
      collection: 'gallery',
      where: { id: { equals: doc.id } },
    })
    expect(row?.cloudinaryType).toBe('authenticated')
    expect(row?.original?.url ?? null).toBeNull()
  })
})
