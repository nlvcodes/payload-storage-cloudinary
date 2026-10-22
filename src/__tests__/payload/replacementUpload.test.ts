import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { STORED_URL_FIELDS } from '../../helpers/deliveryURL'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// Unversioned, the v3 default: a replacement deletes the old asset. Payload v4 versions every
// collection by default and keeps a replaced file for its versions; see the `versioned` collection.
const uploadCollection = (slug: string, versions = false): CollectionConfig => ({
  slug,
  upload: true,
  versions,
  fields: [{ name: 'alt', type: 'text' }],
})

describe('a replacement file uploads', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [
        uploadCollection('media'),
        uploadCollection('folders'),
        uploadCollection('previews'),
        uploadCollection('versioned', true),
      ],
      pluginCollections: {
        media: { privateFiles: true },
        folders: { privateFiles: true, folder: { path: 'originals', enableDynamic: true } },
        previews: {
          privateFiles: true,
          transformations: { default: {}, publicTransformation: { enabled: true } },
        },
        versioned: { privateFiles: true },
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (
    filename: string,
    data: Record<string, unknown> = {},
    collection = 'media',
  ) => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename, data),
      user,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc
  }

  // Sends the update and returns the Cloudinary calls it made.
  const update = async (
    id: string | number,
    body: FormData | Record<string, unknown>,
    collection = 'media',
  ) => {
    const before = harness.cloudinary.calls.length
    const res = await harness.request(`/api/${collection}/${id}`, {
      method: 'PATCH',
      ...(body instanceof FormData
        ? { body }
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      user,
    })
    expect(res.status).toBe(200)
    return harness.cloudinary.calls.slice(before)
  }

  // The stored row, read past every hook.
  const storedRow = async (id: string | number, collection = 'media') =>
    (await harness.payload.db.findOne<Record<string, any>>({
      collection,
      where: { id: { equals: id } },
    }))!

  const uploadsIn = (calls: typeof harness.cloudinary.calls) =>
    calls.filter((c) => c.method === 'upload_stream')

  it('uploads the replacement and stores the new asset', async () => {
    const doc = await upload('first.png', { isPrivate: false })

    const calls = await update(doc.id, pngUpload('first.png'))

    const uploads = uploadsIn(calls)
    expect(uploads).toHaveLength(1)
    const result = uploads[0].result
    expect(result.public_id).not.toBe(doc.cloudinaryPublicId)
    expect(await storedRow(doc.id)).toMatchObject({
      cloudinaryPublicId: result.public_id,
      cloudinaryType: 'upload',
      cloudinaryVersion: result.version,
    })
    // The storage plugin deletes the old asset before the upload.
    expect(
      calls.filter((c) => c.method === 'destroy' && c.publicId === doc.cloudinaryPublicId),
    ).toHaveLength(1)
  })

  it('keeps the old asset of a versioned collection, which its versions still reference', async () => {
    const doc = await upload('versioned-old.png', { isPrivate: false }, 'versioned')

    const calls = await update(doc.id, pngUpload('versioned-new.png'), 'versioned')

    const uploads = uploadsIn(calls)
    expect(uploads).toHaveLength(1)
    expect(await storedRow(doc.id, 'versioned')).toMatchObject({
      cloudinaryPublicId: uploads[0].result.public_id,
      cloudinaryType: 'upload',
    })
    expect(calls.filter((c) => c.method === 'destroy')).toHaveLength(0)
  })

  it('returns a URL for the new asset on a read after the replacement', async () => {
    const doc = await upload('read-old.png', { isPrivate: false })

    const calls = await update(doc.id, pngUpload('read-new.png'))
    const res = await harness.request(`/api/media/${doc.id}`, { user })

    const newId = uploadsIn(calls)[0].result.public_id
    const read = await res.json()
    expect(read.url).toContain(newId)
    expect(read.url).not.toContain(doc.cloudinaryPublicId)
  })

  it.each([
    ['private', 'to-private.png', false, true, 'authenticated'],
    ['public', 'to-public.png', true, false, 'upload'],
  ])(
    'uploads a replacement marked %s with the new type',
    async (_label, filename, before, after, type) => {
      const doc = await upload(filename, { isPrivate: before })

      const calls = await update(doc.id, pngUpload(filename, { isPrivate: after }))

      const uploads = uploadsIn(calls)
      expect(uploads).toHaveLength(1)
      expect(uploads[0].options.type ?? 'upload').toBe(type)
      expect(calls.filter((c) => c.method === 'rename')).toHaveLength(0)
      expect(await storedRow(doc.id)).toMatchObject({ isPrivate: after, cloudinaryType: type })
    },
  )

  it('uploads a replacement with the stored privacy and folder', async () => {
    const doc = await upload('kept.png', { cloudinaryFolder: 'kept' }, 'folders')

    const calls = await update(doc.id, pngUpload('kept-new.png'), 'folders')

    const uploads = uploadsIn(calls)
    expect(uploads).toHaveLength(1)
    expect(uploads[0].options).toMatchObject({ type: 'authenticated', folder: 'kept' })
    expect(await storedRow(doc.id, 'folders')).toMatchObject({
      cloudinaryPublicId: uploads[0].result.public_id,
      cloudinaryType: 'authenticated',
    })
  })

  it('stores no URL of the old asset when the replacement is private', async () => {
    const doc = await upload('old-public.png', { isPrivate: false })

    await update(doc.id, pngUpload('new-private.png', { isPrivate: true }))

    const row = await storedRow(doc.id)
    for (const field of STORED_URL_FIELDS) {
      expect(row[field] ?? '', field).not.toContain(doc.cloudinaryPublicId)
    }
  })

  it('stores no URL of the old asset when a private replacement lands on a legacy row', async () => {
    const doc = await upload('legacy-old.png', { isPrivate: true }, 'previews')
    // A row from before 1.3.0 stored a URL of the old asset in every URL field. Its originalUrl
    // reads as original.url in 2.0, whose column Payload v4's original group took over.
    const oldURL = `https://res.cloudinary.com/demo/image/upload/${doc.cloudinaryPublicId}.png`
    // The adapter adds keys to the data it writes, so each use gets its own copy
    const legacyURLs = () => ({
      ...Object.fromEntries(
        STORED_URL_FIELDS.filter((field) => field !== 'originalUrl').map((field) => [
          field,
          oldURL,
        ]),
      ),
      original: { url: oldURL },
    })
    await harness.payload.db.updateOne({ collection: 'previews', id: doc.id, data: legacyURLs() })
    expect(await storedRow(doc.id, 'previews')).toMatchObject(legacyURLs())

    await update(doc.id, pngUpload('legacy-new.png', { isPrivate: true }), 'previews')

    const row = await storedRow(doc.id, 'previews')
    for (const field of STORED_URL_FIELDS) {
      expect(row[field] ?? '', field).not.toContain(doc.cloudinaryPublicId)
    }
    expect(row.original?.url ?? '', 'original.url').not.toContain(doc.cloudinaryPublicId)
  })

  it('uploads nothing and deletes nothing on an update without a file', async () => {
    const doc = await upload('no-file.png', { isPrivate: false })

    const calls = await update(doc.id, { alt: 'unchanged file' })

    expect(uploadsIn(calls)).toHaveLength(0)
    expect(calls.filter((c) => c.method === 'destroy')).toHaveLength(0)
    expect((await storedRow(doc.id)).cloudinaryPublicId).toBe(doc.cloudinaryPublicId)
  })
})
