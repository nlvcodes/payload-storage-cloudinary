import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APIError, createLocalReq, type CollectionConfig } from 'payload'
import { migratePrivateAssets } from '../../index'
import { STORED_URL_FIELDS } from '../../helpers/deliveryURL'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'
import type { StartOptions } from './harness'

/**
 * The invariant: no asset is ever at type `upload` while a stored row says the file is private.
 * When the plugin can't keep the asset and the row in step, it leaves a broken link, never an
 * exposed file.
 */

// Set `failAt` on a document to make its next save fail at that step, after the database write.
const failingHooks: CollectionConfig['hooks'] = {
  afterChange: [
    ({ doc }) => {
      if (doc.failAt === 'afterChange') throw new APIError('Injected afterChange failure', 500)
      return doc
    },
  ],
  afterOperation: [
    ({ operation, result }) => {
      if (operation === 'updateByID' && (result as any)?.failAt === 'afterOperation') {
        throw new APIError('Injected afterOperation failure', 500)
      }
      return result
    },
  ],
}

// `title` is required, so an update that empties it fails validation.
const titled = (slug: string, extra: Partial<CollectionConfig> = {}): CollectionConfig => ({
  slug,
  upload: true,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'failAt', type: 'text' },
  ],
  hooks: failingHooks,
  ...extra,
})

type Asset = { publicId: string; type: string }

async function boot(options: Pick<StartOptions, 'transactionOptions'> = {}) {
  return startPayload({
    ...options,
    collections: [
      titled('media'),
      titled('folders'),
      titled('drafts', { versions: { drafts: true } }),
    ],
    pluginCollections: {
      media: { privateFiles: true },
      folders: { privateFiles: true, folder: { path: 'originals', enableDynamic: true } },
      drafts: { privateFiles: true },
    },
  })
}

function helpers(getHarness: () => PayloadHarness, getUser: () => TestUser) {
  const upload = async (
    filename: string,
    data: Record<string, unknown> = {},
    collection = 'media',
  ) => {
    const res = await getHarness().request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename, { title: filename, ...data }),
      user: getUser(),
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc as Record<string, any>
  }

  const update = (
    id: string | number,
    data: Record<string, unknown>,
    collection = 'media',
    query = '',
  ) =>
    getHarness().request(`/api/${collection}/${id}${query}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      user: getUser(),
    })

  // The stored row, read through the database adapter, past every hook and access check.
  const storedRow = async (id: string | number, collection = 'media') =>
    (await getHarness().payload.db.findOne<Record<string, any>>({
      collection,
      where: { id: { equals: id } },
    }))!

  // The newest version row of a document.
  const latestVersion = async (id: string | number, collection: string) => {
    const { docs } = await getHarness().payload.db.findVersions<Record<string, any>>({
      collection,
      where: { parent: { equals: id } },
      sort: '-updatedAt',
      limit: 1,
    })
    return docs[0]?.version as Record<string, any>
  }

  // Where an asset is now: its upload, then every rename Cloudinary carried out on it.
  const assetNow = (uploaded: Record<string, any>): Asset => {
    const calls = getHarness().cloudinary.calls
    const upload = calls.find(
      (c) => c.method === 'upload_stream' && c.result.public_id === uploaded.cloudinaryPublicId,
    )!
    let asset: Asset = { publicId: upload.result.public_id, type: upload.result.type }
    for (const call of calls) {
      if (call.method !== 'rename' || call.error) continue
      if (call.publicId !== asset.publicId || (call.options.type ?? 'upload') !== asset.type) {
        continue
      }
      asset = { publicId: call.options.to, type: call.options.to_type ?? call.options.type }
    }
    return asset
  }

  const renamesTo = (uploaded: Record<string, any>, type: string) =>
    getHarness().cloudinary.calls.filter(
      (c) =>
        c.method === 'rename' &&
        !c.error &&
        c.publicId === uploaded.cloudinaryPublicId &&
        c.options.to_type === type,
    )

  // A row says a file is private by the same test the read path uses.
  const saysPrivate = (row: Record<string, any>) =>
    row.isPrivate === true ||
    row.requiresSignedURL === true ||
    row.cloudinaryType === 'authenticated'

  // The invariant, checked against the document row.
  const expectInStep = (row: Record<string, any>, asset: Asset) => {
    if (saysPrivate(row)) expect(asset.type).toBe('authenticated')
    expect(asset.publicId).toBe(row.cloudinaryPublicId)
    expect(asset.type).toBe(row.cloudinaryType)
  }

  return { upload, update, storedRow, latestVersion, assetNow, renamesTo, expectInStep }
}

describe('privacy and folder changes keep the asset and the row in step', () => {
  let harness: PayloadHarness
  let user: TestUser
  const h = helpers(
    () => harness,
    () => user,
  )

  beforeAll(async () => {
    harness = await boot()
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('stores no delivery URL when a private file moves to another folder', async () => {
    const doc = await h.upload('moved.png', {}, 'folders')

    const res = await h.update(doc.id, { cloudinaryFolder: 'moved' }, 'folders')

    expect(res.status).toBe(200)
    const row = await h.storedRow(doc.id, 'folders')
    expect(row.cloudinaryPublicId).toMatch(/^moved\//)
    expect(row.cloudinaryType).toBe('authenticated')
    for (const field of STORED_URL_FIELDS) expect(row[field] ?? null, field).toBeNull()
    h.expectInStep(row, h.assetNow(doc))

    // The migration finds nothing to do for the moved file.
    const report = await migratePrivateAssets({
      payload: harness.payload,
      req: await createLocalReq({}, harness.payload),
      collection: 'folders',
      dryRun: true,
    })
    expect(report.changed.map((d) => d.id)).not.toContain(doc.id)
  })

  it('leaves the asset authenticated when a save marking it public fails validation', async () => {
    const doc = await h.upload('public-invalid.png')

    const res = await h.update(doc.id, { isPrivate: false, title: '' })

    expect(res.status).toBe(400)
    expect(h.renamesTo(doc, 'upload')).toHaveLength(0)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: true, cloudinaryType: 'authenticated' })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('moves the asset back to upload when a save marking it private fails validation', async () => {
    const doc = await h.upload('private-invalid.png', { isPrivate: false })

    const res = await h.update(doc.id, { isPrivate: true, title: '' })

    expect(res.status).toBe(400)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: false, cloudinaryType: 'upload' })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('moves the asset back when a folder move of a private file fails validation', async () => {
    const doc = await h.upload('folder-invalid.png', {}, 'folders')

    const res = await h.update(doc.id, { cloudinaryFolder: 'elsewhere', title: '' }, 'folders')

    expect(res.status).toBe(400)
    const row = await h.storedRow(doc.id, 'folders')
    expect(row.cloudinaryPublicId).toBe(doc.cloudinaryPublicId)
    h.expectInStep(row, h.assetNow(doc))
  })

  it('fails the save and keeps the row private when the rename to upload fails', async () => {
    const doc = await h.upload('public-rename-fails.png')
    harness.cloudinary.failOn(
      'rename',
      doc.cloudinaryPublicId,
      { message: 'Rate limited' },
      {
        times: 1,
      },
    )

    const res = await h.update(doc.id, { isPrivate: false })

    expect(res.status).toBe(502)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({
      isPrivate: true,
      requiresSignedURL: true,
      cloudinaryType: 'authenticated',
    })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('fails the save and keeps the row public when the rename to authenticated fails', async () => {
    const doc = await h.upload('private-rename-fails.png', { isPrivate: false })
    harness.cloudinary.failOn(
      'rename',
      doc.cloudinaryPublicId,
      { message: 'Rate limited' },
      {
        times: 1,
      },
    )

    const res = await h.update(doc.id, { isPrivate: true })

    expect(res.status).toBe(502)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: false, cloudinaryType: 'upload' })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('leaves the asset authenticated when a hook fails after the row says public', async () => {
    const doc = await h.upload('public-hook-fails.png')

    const res = await h.update(doc.id, { isPrivate: false, failAt: 'afterChange' })

    expect(res.status).toBe(500)
    expect(h.renamesTo(doc, 'upload')).toHaveLength(0)
    // Without a transaction the row keeps the write, and still reads as private by its type.
    const row = await h.storedRow(doc.id)
    expect(row.cloudinaryType).toBe('authenticated')
    h.expectInStep(row, h.assetNow(doc))
  })

  describe('with drafts', () => {
    it('keeps the asset authenticated until the save that marks it public is published', async () => {
      const doc = await h.upload('draft.png', { _status: 'published' }, 'drafts')

      const draft = await h.update(
        doc.id,
        { isPrivate: false, _status: 'draft' },
        'drafts',
        '?draft=true',
      )
      expect(draft.status).toBe(200)
      expect(h.renamesTo(doc, 'upload')).toHaveLength(0)
      const published = await h.storedRow(doc.id, 'drafts')
      expect(published).toMatchObject({ isPrivate: true, cloudinaryType: 'authenticated' })
      h.expectInStep(published, h.assetNow(doc))

      const publish = await h.update(doc.id, { isPrivate: false, _status: 'published' }, 'drafts')
      expect(publish.status).toBe(200)
      expect(h.renamesTo(doc, 'upload')).toHaveLength(1)
      const row = await h.storedRow(doc.id, 'drafts')
      expect(row).toMatchObject({ isPrivate: false, cloudinaryType: 'upload' })
      h.expectInStep(row, h.assetNow(doc))
      // The version row the publish wrote records the asset where it now is.
      expect(await h.latestVersion(doc.id, 'drafts')).toMatchObject({
        isPrivate: false,
        cloudinaryType: 'upload',
        cloudinaryPublicId: doc.cloudinaryPublicId,
      })
    })
  })
})

describe('privacy and folder changes keep the asset and the row in step, in a transaction', () => {
  let harness: PayloadHarness
  let user: TestUser
  const h = helpers(
    () => harness,
    () => user,
  )

  beforeAll(async () => {
    harness = await boot({ transactionOptions: {} })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it.each([
    ['public', 'to-public.png', true, false, 'upload'],
    ['private', 'to-private.png', false, true, 'authenticated'],
  ])('marks a file %s', async (_label, filename, before, after, type) => {
    const doc = await h.upload(filename, { isPrivate: before })

    const res = await h.update(doc.id, { isPrivate: after })

    expect(res.status).toBe(200)
    const renames = h.renamesTo(doc, type)
    expect(renames).toHaveLength(1)
    expect(renames[0].options).toMatchObject({ to_type: type, invalidate: true })
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: after, cloudinaryType: type })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('leaves the asset authenticated when a hook fails before the move to upload', async () => {
    const doc = await h.upload('rolled-back-early.png')

    const res = await h.update(doc.id, { isPrivate: false, failAt: 'afterChange' })

    expect(res.status).toBe(500)
    expect(h.renamesTo(doc, 'upload')).toHaveLength(0)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: true, cloudinaryType: 'authenticated' })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('moves the asset back to authenticated when the save rolls back after the move', async () => {
    const doc = await h.upload('rolled-back-late.png')

    const res = await h.update(doc.id, { isPrivate: false, failAt: 'afterOperation' })

    expect(res.status).toBe(500)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: true, cloudinaryType: 'authenticated' })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('moves the asset back to upload when a save marking it private rolls back', async () => {
    const doc = await h.upload('private-rolled-back.png', { isPrivate: false })

    const res = await h.update(doc.id, { isPrivate: true, failAt: 'afterChange' })

    expect(res.status).toBe(500)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: false, cloudinaryType: 'upload' })
    h.expectInStep(row, h.assetNow(doc))
  })

  it('fails the save and keeps the row private when the rename to upload fails', async () => {
    const doc = await h.upload('rename-fails-in-transaction.png')
    harness.cloudinary.failOn(
      'rename',
      doc.cloudinaryPublicId,
      { message: 'Rate limited' },
      {
        times: 1,
      },
    )

    const res = await h.update(doc.id, { isPrivate: false })

    expect(res.status).toBe(502)
    const row = await h.storedRow(doc.id)
    expect(row).toMatchObject({ isPrivate: true, cloudinaryType: 'authenticated' })
    h.expectInStep(row, h.assetNow(doc))
  })
})
