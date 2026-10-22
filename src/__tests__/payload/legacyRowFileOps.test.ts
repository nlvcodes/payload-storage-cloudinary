import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// Unversioned, so a replaced or deleted file has no version left to keep it
const uploadCollection = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  versions: false,
  fields: [{ name: 'alt', type: 'text' }],
})

// A row a 1.x plugin wrote under Payload v3 has no `_objectKey` and no `original` group: every
// row a site holds when it upgrades. Payload v4 still deletes its file on a replacement or delete.
describe('a row from before Payload v4', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [uploadCollection('media'), uploadCollection('kept')],
      pluginCollections: {
        media: { privateFiles: true },
        kept: { privateFiles: true, deleteFromCloudinary: false },
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  // Uploads a file, then rewrites its row the way 1.x left it, past every hook
  const uploadLegacy = async (filename: string, isPrivate: boolean, collection = 'media') => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename, { isPrivate }),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    await harness.payload.db.updateOne({
      collection,
      id: doc.id,
      data: {
        filename,
        _objectKey: null,
        prefix: null,
        original: {
          filename: null,
          url: null,
          mimeType: null,
          filesize: null,
          prefix: null,
          _objectKey: null,
        },
      },
      returning: false,
    })
    return doc as { id: number; cloudinaryPublicId: string }
  }

  const destroysOf = (before: number) =>
    harness.cloudinary.calls
      .slice(before)
      .filter((c) => c.method === 'destroy')
      .map((c) => c.publicId)

  it.each([
    ['public', false],
    ['private', true],
  ])('deletes the old asset of a %s row when a new file replaces it', async (_label, isPrivate) => {
    const doc = await uploadLegacy(`legacy-replace-${String(isPrivate)}.png`, isPrivate)
    const before = harness.cloudinary.calls.length

    const res = await harness.request(`/api/media/${doc.id}`, {
      method: 'PATCH',
      body: pngUpload(`legacy-replacement-${String(isPrivate)}.png`),
      user,
    })

    expect(res.status).toBe(200)
    expect(destroysOf(before)).toEqual([doc.cloudinaryPublicId])
  })

  it.each([
    ['public', false],
    ['private', true],
  ])('deletes the asset of a %s row when the document is deleted', async (_label, isPrivate) => {
    const doc = await uploadLegacy(`legacy-delete-${String(isPrivate)}.png`, isPrivate)
    const before = harness.cloudinary.calls.length

    const res = await harness.request(`/api/media/${doc.id}`, { method: 'DELETE', user })

    expect(res.status).toBe(200)
    expect(destroysOf(before)).toEqual([doc.cloudinaryPublicId])
  })

  it('keeps the old asset when the collection sets deleteFromCloudinary: false', async () => {
    const doc = await uploadLegacy('legacy-kept.png', true, 'kept')
    const before = harness.cloudinary.calls.length

    const res = await harness.request(`/api/kept/${doc.id}`, {
      method: 'PATCH',
      body: pngUpload('legacy-kept-replacement.png'),
      user,
    })

    expect(res.status).toBe(200)
    expect(destroysOf(before)).toEqual([])
  })
})
