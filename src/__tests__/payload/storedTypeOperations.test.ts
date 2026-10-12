import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { createPayloadRequest, type CollectionConfig } from 'payload'
import { changeDeliveryType } from '../../index'
import { STORED_URL_FIELDS } from '../../helpers/deliveryURL'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

const uploadCollection = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  fields: [],
})

describe('Cloudinary operations use the stored type', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [uploadCollection('media'), uploadCollection('folders')],
      pluginCollections: {
        media: { privateFiles: true },
        folders: { privateFiles: true, folder: { path: 'originals', enableDynamic: true } },
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

  const update = (id: string | number, data: Record<string, unknown>, collection = 'media') =>
    harness.request(`/api/${collection}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      user,
    })

  // Reading the stored row is a trusted check, so it skips access on purpose.
  const stored = async (id: string | number, collection: 'media' | 'folders' = 'media') =>
    harness.payload.findByID({
      collection,
      id,
      req: await createPayloadRequest({ payload: harness.payload }),
      overrideAccess: true,
    })

  // A folder move keeps the last segment of the public ID.
  const nameOf = (publicId: string) => publicId.split('/').pop()

  const renamesOf = (publicId: string) =>
    harness.cloudinary.calls.filter((c) => c.method === 'rename' && c.publicId === publicId)

  it('renames a file marked private to authenticated and stores the new type', async () => {
    const doc = await upload('to-private.png', { isPrivate: false })

    const res = await update(doc.id, { isPrivate: true })

    expect(res.status).toBe(200)
    const renames = renamesOf(doc.cloudinaryPublicId)
    expect(renames).toHaveLength(1)
    expect(renames[0].options).toMatchObject({
      to: doc.cloudinaryPublicId,
      type: 'upload',
      to_type: 'authenticated',
      invalidate: true,
    })
    expect((await stored(doc.id)).cloudinaryType).toBe('authenticated')
  })

  it('renames a file marked public to upload and stores the new type', async () => {
    const doc = await upload('to-public.png')

    const res = await update(doc.id, { isPrivate: false })

    expect(res.status).toBe(200)
    const renames = renamesOf(doc.cloudinaryPublicId)
    expect(renames).toHaveLength(1)
    expect(renames[0].options).toMatchObject({
      to: doc.cloudinaryPublicId,
      type: 'authenticated',
      to_type: 'upload',
      invalidate: true,
    })
    expect((await stored(doc.id)).cloudinaryType).toBe('upload')
  })

  it('keeps a file public when Cloudinary rejects the rename', async () => {
    const doc = await upload('rename-fails.png', { isPrivate: false })
    vi.mocked(cloudinary.uploader.rename).mockRejectedValueOnce(new Error('Resource not found'))

    const res = await update(doc.id, { isPrivate: true })

    expect(res.status).toBe(502)
    const row = await stored(doc.id)
    expect(row.isPrivate).toBe(false)
    expect(row.cloudinaryType).toBe('upload')
  })

  describe('the privacy toggle writes no delivery URL', () => {
    const URL_FIELDS = [
      'url',
      'thumbnailURL',
      'cloudinaryUrl',
      'originalUrl',
      'transformedUrl',
      'previewUrl',
    ]
    const urlsOf = (doc: Record<string, any>) =>
      Object.fromEntries(URL_FIELDS.map((field) => [field, doc[field] ?? null]))
    // The stored row, read past every hook: a read builds its URLs from the stored type.
    const storedRow = async (id: string | number) =>
      (await harness.payload.db.findOne<Record<string, any>>({
        collection: 'media',
        where: { id: { equals: id } },
      }))!

    it.each([
      ['private', 'toggle-private.png', false, true],
      ['public', 'toggle-public.png', true, false],
    ])('when a file is marked %s', async (_label, filename, before, after) => {
      const doc = await upload(filename, { isPrivate: before })
      const storedBefore = urlsOf(await storedRow(doc.id))

      const res = await update(doc.id, { isPrivate: after })
      expect(res.status).toBe(200)
      const { doc: returned } = await res.json()
      const readBack = await harness.request(`/api/media/${doc.id}`, { user })

      // Payload may clear a stored URL on update, but the toggle stores no new one.
      const storedAfter = urlsOf(await storedRow(doc.id))
      for (const field of URL_FIELDS) {
        if (storedAfter[field]) expect(storedAfter[field], field).toBe(storedBefore[field])
      }
      // The response carries the URLs a read builds, not URLs the toggle wrote.
      expect(urlsOf(returned)).toEqual(urlsOf(await readBack.json()))
    })
  })

  it('moves a private file to another folder with its stored type', async () => {
    const doc = await upload('moved.png', {}, 'folders')
    const movedId = `moved/${nameOf(doc.cloudinaryPublicId)}`

    const res = await update(doc.id, { cloudinaryFolder: 'moved' }, 'folders')

    expect(res.status).toBe(200)
    const renames = renamesOf(doc.cloudinaryPublicId)
    expect(renames).toHaveLength(1)
    expect(renames[0].options).toMatchObject({
      to: movedId,
      type: 'authenticated',
      to_type: 'authenticated',
      invalidate: true,
    })
    const row = await stored(doc.id, 'folders')
    expect(row.cloudinaryPublicId).toBe(movedId)
    expect(row.cloudinaryType).toBe('authenticated')
    // The row, read past every hook, holds no delivery URL of the moved private file.
    const dbRow = (await harness.payload.db.findOne<Record<string, any>>({
      collection: 'folders',
      where: { id: { equals: doc.id } },
    }))!
    for (const field of STORED_URL_FIELDS) expect(dbRow[field] ?? null, field).toBeNull()
  })

  it('moves and marks a file public in one rename', async () => {
    const doc = await upload('moved-public.png', {}, 'folders')
    const movedId = `shared/${nameOf(doc.cloudinaryPublicId)}`

    const res = await update(doc.id, { cloudinaryFolder: 'shared', isPrivate: false }, 'folders')

    expect(res.status).toBe(200)
    const renames = renamesOf(doc.cloudinaryPublicId)
    expect(renames).toHaveLength(1)
    expect(renames[0].options).toMatchObject({
      to: movedId,
      type: 'authenticated',
      to_type: 'upload',
      invalidate: true,
    })
    const row = await stored(doc.id, 'folders')
    expect(row.cloudinaryPublicId).toBe(movedId)
    expect(row.cloudinaryType).toBe('upload')
  })

  it('keeps the folder when a privacy change sends no new folder', async () => {
    const doc = await upload('stays.png', { cloudinaryFolder: 'kept' }, 'folders')

    const res = await update(doc.id, { isPrivate: false }, 'folders')

    expect(res.status).toBe(200)
    const renames = renamesOf(doc.cloudinaryPublicId)
    expect(renames).toHaveLength(1)
    expect(renames[0].options.to).toBe(doc.cloudinaryPublicId)
    expect((await stored(doc.id, 'folders')).cloudinaryPublicId).toBe(doc.cloudinaryPublicId)
  })

  it('renames nothing when an update uploads a replacement file', async () => {
    const doc = await upload('replaced.png', { isPrivate: false })

    const res = await harness.request(`/api/media/${doc.id}`, {
      method: 'PATCH',
      body: pngUpload('replacement.png', { isPrivate: true }),
      user,
    })

    expect(res.status).toBe(200)
    // The storage plugin deletes the old asset and uploads the replacement with the new type.
    expect(renamesOf(doc.cloudinaryPublicId)).toHaveLength(0)
    const replacement = harness.cloudinary.calls.findLast((c) => c.method === 'upload_stream')!
    expect(replacement.publicId).not.toBe(doc.cloudinaryPublicId)
    expect(replacement.options.type).toBe('authenticated')
    expect(await stored(doc.id)).toMatchObject({
      cloudinaryPublicId: replacement.publicId,
      cloudinaryType: 'authenticated',
    })
  })

  it.each([
    ['private', 'delete-private.png', true, 'authenticated'],
    ['public', 'delete-public.png', false, 'upload'],
  ])('destroys a %s file with its stored type', async (_label, filename, isPrivate, type) => {
    const doc = await upload(filename, { isPrivate })

    const res = await harness.request(`/api/media/${doc.id}`, { method: 'DELETE', user })

    expect(res.status).toBe(200)
    const destroys = harness.cloudinary.calls.filter(
      (c) => c.method === 'destroy' && c.publicId === doc.cloudinaryPublicId,
    )
    expect(destroys).toHaveLength(1)
    expect(destroys[0].options).toMatchObject({ type, invalidate: true })
  })

  it('exports the type change for a migration to reuse', async () => {
    const changed = await changeDeliveryType(
      {
        publicId: 'legacy/photo',
        version: 1600000000,
        resourceType: 'image',
        format: 'png',
        deliveryType: 'upload',
      },
      'authenticated',
    )

    expect(renamesOf('legacy/photo').at(-1)?.options).toMatchObject({
      to: 'legacy/photo',
      resource_type: 'image',
      type: 'upload',
      to_type: 'authenticated',
      invalidate: true,
    })
    expect(changed).toMatchObject({ publicId: 'legacy/photo', deliveryType: 'authenticated' })
  })
})
