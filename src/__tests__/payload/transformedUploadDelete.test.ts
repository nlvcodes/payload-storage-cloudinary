import { sharpTransformer } from '@payloadcms/transformer-sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// The sharp transformer converts every upload to WebP, so Payload stages the untransformed file too.
const photos: CollectionConfig = {
  slug: 'photos',
  upload: true,
  fields: [],
}

describe('deleting a document whose upload Payload transformed', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [photos],
      pluginCollections: { photos: { privateFiles: true } },
      upload: {
        transformers: [
          sharpTransformer({ collections: { photos: { formatOptions: { format: 'webp' } } } }),
        ],
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('uploads only the main file and destroys every asset the upload created', async () => {
    const res = await harness.request('/api/photos', {
      method: 'POST',
      body: pngUpload('photo.png'),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()

    const uploaded = harness.cloudinary.calls
      .filter((c) => c.method === 'upload_stream')
      .map((c) => c.result.public_id)
    // Only the main file goes to Cloudinary: the untransformed `-original` is delivered from it
    expect(uploaded.length).toBe(1)

    const deleted = await harness.request(`/api/photos/${doc.id}`, { method: 'DELETE', user })
    expect(deleted.status).toBe(200)

    const destroyed = harness.cloudinary.calls
      .filter((c) => c.method === 'destroy')
      .map((c) => c.publicId)
    expect(destroyed.sort()).toEqual(uploaded.sort())
  })
})

// Variants are delivered from the main asset by Cloudinary transformations, so they are not
// uploaded on their own.
describe('deleting a document with image variants', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [{ slug: 'sized', upload: true, fields: [] }],
      pluginCollections: { sized: true },
      upload: {
        transformers: [
          sharpTransformer({
            collections: { sized: { variants: [{ name: 'thumb', width: 1, height: 1 }] } },
          }),
        ],
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('uploads only the main file and destroys it once', async () => {
    const res = await harness.request('/api/sized', {
      method: 'POST',
      body: pngUpload('sized.png'),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    expect(doc.variants?.thumb?.url).toContain(doc.cloudinaryPublicId)

    const deleted = await harness.request(`/api/sized/${doc.id}`, { method: 'DELETE', user })
    expect(deleted.status).toBe(200)

    const uploaded = harness.cloudinary.calls
      .filter((c) => c.method === 'upload_stream')
      .map((c) => c.result.public_id)
    const destroyed = harness.cloudinary.calls
      .filter((c) => c.method === 'destroy')
      .map((c) => c.publicId)
    expect(uploaded).toEqual([doc.cloudinaryPublicId])
    expect(destroyed).toEqual([doc.cloudinaryPublicId])
  })
})
