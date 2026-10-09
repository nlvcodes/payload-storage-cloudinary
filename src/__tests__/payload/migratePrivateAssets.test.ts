import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type CollectionConfig } from 'payload'
import { migratePrivateAssets } from '../../index'
import { startPayload, TEST_CLOUD, type CloudinaryCall, type PayloadHarness } from './harness'

// The migration runs as a trusted server job, so these collections let nobody read or write.
const lockedCollection = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  access: { read: () => false, update: () => false },
  ...(VERSIONED_SLUGS.includes(slug) ? { versions: { drafts: true } } : {}),
  fields: [],
})

const SLUGS = [
  'dry',
  'real',
  'failing',
  'unwritable',
  'stuck',
  'unflagged',
  'copies',
  'drafted',
  'draftedFails',
  'recovered',
  'unrecoverable',
  'storedCopies',
  'recoveredUnwritable',
  'lookupFails',
  'duplicate',
  'readableDrafts',
  'many',
] as const
type Slug = (typeof SLUGS)[number]
const VERSIONED_SLUGS: string[] = ['drafted', 'draftedFails'] satisfies Slug[]

// Drafts any logged-in user may read, with the original open to every reader of the document.
const readableDrafts: CollectionConfig = {
  slug: 'readableDrafts',
  upload: true,
  versions: { drafts: true },
  fields: [{ name: 'title', type: 'text' }],
}

const pluginConfig = {
  privateFiles: true,
  transformations: {
    // The `default` key makes the plugin read this as the organized format.
    default: {},
    publicTransformation: { enabled: true, watermark: { defaultText: 'Preview' } },
  },
}

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const VERSION = 1690000000

// Every stored field that held a delivery URL in 1.2.x.
const URL_FIELDS = [
  'url',
  'thumbnailURL',
  'cloudinaryUrl',
  'originalUrl',
  'transformedUrl',
  'previewUrl',
  'publicTransformationUrl',
] as const

const uploadURLs = (publicId: string) => ({
  url: `${BASE}/upload/v${VERSION}/${publicId}.png`,
  thumbnailURL: `${BASE}/upload/c_fill,w_150,h_150/v${VERSION}/${publicId}.png`,
  cloudinaryUrl: `${BASE}/upload/v${VERSION}/${publicId}.png`,
  originalUrl: `${BASE}/upload/v${VERSION}/${publicId}.png`,
})

const authenticatedURLs = (publicId: string) => ({
  url: `${BASE}/authenticated/s--AbCdEfGh--/v${VERSION}/${publicId}.png`,
  thumbnailURL: `${BASE}/authenticated/s--IjKlMnOp--/c_fill,w_150,h_150/v${VERSION}/${publicId}.png`,
  cloudinaryUrl: `${BASE}/authenticated/s--AbCdEfGh--/v${VERSION}/${publicId}.png`,
  originalUrl: `${BASE}/authenticated/s--AbCdEfGh--/v${VERSION}/${publicId}.png`,
})

// The rows a 1.2.x database holds, one per kind of document the migration meets.
const LEGACY_ROWS = {
  // A private original from the old publicTransformation path: an `upload` asset with a
  // public watermarked copy beside it.
  privateUpload: (publicId: string) => ({
    isPrivate: true,
    requiresSignedURL: true,
    hasPublicTransformation: true,
    transformationType: 'watermark',
    ...uploadURLs(publicId),
    publicTransformationUrl: `${BASE}/upload/l_text:Arial_40:Preview/v${VERSION}/${publicId}.png`,
  }),
  // A private original from the plain privateFiles path: already `authenticated`.
  privateAuthenticated: (publicId: string) => ({
    isPrivate: true,
    requiresSignedURL: true,
    ...authenticatedURLs(publicId),
  }),
  // A private original uploaded by 1.3.0: typed, and no delivery URL stored.
  current: () => ({ isPrivate: true, requiresSignedURL: true, cloudinaryType: 'authenticated' }),
  // A public file: the migration leaves it alone.
  public: (publicId: string) => ({ isPrivate: false, ...uploadURLs(publicId) }),
  // A public file with the preview turned on. Versions before 1.3.0 made no copy of it.
  publicWithPreview: (publicId: string) => ({
    isPrivate: false,
    hasPublicTransformation: true,
    transformationType: 'blur',
    ...uploadURLs(publicId),
  }),
  // An `authenticated` asset with neither privacy flag set. The read path treats it as private.
  unflaggedAuthenticated: (publicId: string) => ({
    isPrivate: false,
    requiresSignedURL: false,
    ...authenticatedURLs(publicId),
  }),
}
type LegacyKind = keyof typeof LEGACY_ROWS

describe('migratePrivateAssets', () => {
  let harness: PayloadHarness
  let seeded = 0

  beforeAll(async () => {
    harness = await startPayload({
      collections: SLUGS.map((slug) =>
        slug === 'readableDrafts' ? readableDrafts : lockedCollection(slug),
      ),
      pluginCollections: Object.fromEntries(
        SLUGS.map((slug) => [
          slug,
          slug === 'readableDrafts' ? { privateFiles: true } : pluginConfig,
        ]),
      ),
    })
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const localReq = () => createLocalReq({}, harness.payload)

  // Writes a row straight to the database, the way 1.2.x left it, without hooks or Cloudinary.
  const seed = async (collection: Slug, kind: LegacyKind) => {
    seeded += 1
    const publicId = `originals/${kind}-${seeded}`
    const data = {
      filename: `${kind}-${seeded}.png`,
      mimeType: 'image/png',
      cloudinaryPublicId: publicId,
      cloudinaryVersion: VERSION,
      cloudinaryResourceType: 'image',
      cloudinaryFormat: 'png',
      ...LEGACY_ROWS[kind](publicId),
    }
    const doc = await harness.payload.db.create({ collection, data, req: await localReq() })
    return { id: doc.id as number, publicId, data }
  }

  // Writes a version row of a document, the way 1.2.x left it on a collection with drafts.
  const seedVersion = async (
    collection: Slug,
    parent: number,
    versionData: Record<string, unknown>,
  ) => {
    const now = new Date().toISOString()
    await harness.payload.db.createVersion({
      collectionSlug: collection,
      parent,
      versionData: versionData as any,
      autosave: false,
      createdAt: now,
      updatedAt: now,
      req: await localReq(),
    })
  }

  // Cloudinary has no upload asset under this public ID: an earlier run moved it.
  const noUploadAsset = (publicId: string) =>
    harness.cloudinary.failOn(
      'resource',
      publicId,
      { message: `Resource not found - ${publicId}`, httpCode: 404 },
      { type: 'upload' },
    )

  // The Cloudinary calls made since `before`, of one method, on one public ID when given.
  const callsSince = (before: number, method: CloudinaryCall['method'], publicId?: string) =>
    harness.cloudinary.calls
      .slice(before)
      .filter((call) => call.method === method && (!publicId || call.publicId === publicId))

  // The stored version rows of a document, in the order they were written.
  const versionRows = async (collection: Slug, parent: number) =>
    (
      await harness.payload.db.findVersions<Record<string, any>>({
        collection,
        where: { parent: { equals: parent } },
        pagination: false,
        sort: 'id',
        req: await localReq(),
      })
    ).docs.map((row) => row.version)

  // The stored rows, read past every hook and every access check.
  const storedRows = async (collection: Slug) =>
    (
      await harness.payload.db.find<Record<string, any>>({
        collection,
        limit: 0,
        pagination: false,
        sort: 'id',
        req: await localReq(),
      })
    ).docs

  const migrate = async (collection: Slug, dryRun?: boolean) =>
    migratePrivateAssets({ payload: harness.payload, req: await localReq(), collection, dryRun })

  // Makes the database write of one document fail, as a lost connection would, until restored.
  const refuseWrite = (id: number) => {
    const updateOne = harness.payload.db.updateOne
    return vi.spyOn(harness.payload.db, 'updateOne').mockImplementation(async (args) => {
      if (args.id === id) throw new Error('Write refused')
      return updateOne.call(harness.payload.db, args)
    })
  }

  const idsOf = (entries: { id: number | string }[]) => entries.map((entry) => entry.id).sort()

  it('reports what a dry run would change and writes nothing', async () => {
    const privateUpload = await seed('dry', 'privateUpload')
    const privateAuthenticated = await seed('dry', 'privateAuthenticated')
    const current = await seed('dry', 'current')
    const publicFile = await seed('dry', 'public')
    const rowsBefore = await storedRows('dry')
    const callsBefore = harness.cloudinary.calls.length

    const report = await migrate('dry', true)

    expect(idsOf(report.changed)).toEqual([privateUpload.id, privateAuthenticated.id])
    expect(idsOf(report.skipped)).toEqual([current.id, publicFile.id])
    expect(report.failed).toEqual([])
    expect(report.publicCopies).toEqual([
      { id: privateUpload.id, publicId: `${privateUpload.publicId}_public_watermark` },
    ])
    expect(harness.cloudinary.calls).toHaveLength(callsBefore)
    expect(await storedRows('dry')).toEqual(rowsBefore)
  })

  describe('a real run', () => {
    let privateUpload: Awaited<ReturnType<typeof seed>>
    let privateAuthenticated: Awaited<ReturnType<typeof seed>>
    let current: Awaited<ReturnType<typeof seed>>
    let publicFile: Awaited<ReturnType<typeof seed>>
    let report: Awaited<ReturnType<typeof migrate>>
    let publicRowBefore: Record<string, any>
    let callsBefore: number

    const rowOf = async (id: number) => (await storedRows('real')).find((row) => row.id === id)!
    const renamesOf = (publicId: string) => callsSince(callsBefore, 'rename', publicId)

    beforeAll(async () => {
      privateUpload = await seed('real', 'privateUpload')
      privateAuthenticated = await seed('real', 'privateAuthenticated')
      current = await seed('real', 'current')
      publicFile = await seed('real', 'public')
      publicRowBefore = await rowOf(publicFile.id)
      callsBefore = harness.cloudinary.calls.length

      report = await migrate('real')
    })

    it('reports the private files it changed', () => {
      expect(idsOf(report.changed)).toEqual([privateUpload.id, privateAuthenticated.id])
      expect(idsOf(report.skipped)).toEqual([current.id, publicFile.id])
      expect(report.failed).toEqual([])
    })

    it('renames a private upload asset to authenticated and invalidates the CDN copy', () => {
      const renames = renamesOf(privateUpload.publicId)
      expect(renames).toHaveLength(1)
      expect(renames[0].options).toMatchObject({
        to: privateUpload.publicId,
        type: 'upload',
        to_type: 'authenticated',
        invalidate: true,
      })
    })

    it('does not rename a private file that is already authenticated', () => {
      expect(renamesOf(privateAuthenticated.publicId)).toEqual([])
    })

    it.each([
      ['an upload asset', () => privateUpload],
      ['an authenticated asset', () => privateAuthenticated],
    ])('records the type of %s and clears its stored URLs', async (_label, docOf) => {
      const row = await rowOf(docOf().id)

      expect(row.cloudinaryType).toBe('authenticated')
      expect(row.cloudinaryPublicId).toBe(docOf().publicId)
      for (const field of URL_FIELDS) expect(row[field] ?? null, field).toBeNull()
    })

    it('lists the public watermarked copy the old publicTransformation path left, and keeps it', () => {
      expect(report.publicCopies).toEqual([
        { id: privateUpload.id, publicId: `${privateUpload.publicId}_public_watermark` },
      ])
      const destroys = callsSince(callsBefore, 'destroy')
      expect(destroys).toEqual([])
    })

    it('leaves a public file as it was', async () => {
      expect(await rowOf(publicFile.id)).toEqual(publicRowBefore)
    })

    it('changes nothing on a second run and skips every document', async () => {
      const rowsBefore = await storedRows('real')
      const callsBeforeRerun = harness.cloudinary.calls.length

      const rerun = await migrate('real')

      expect(rerun.changed).toEqual([])
      expect(rerun.failed).toEqual([])
      // The copy stays until the site owner deletes it, so every run lists it.
      expect(rerun.publicCopies).toEqual(report.publicCopies)
      expect(idsOf(rerun.skipped)).toEqual(rowsBefore.map((row) => row.id).sort())
      expect(harness.cloudinary.calls).toHaveLength(callsBeforeRerun)
      expect(await storedRows('real')).toEqual(rowsBefore)
    })
  })

  it('reports a failed rename and migrates the other documents', async () => {
    const refused = await seed('failing', 'privateUpload')
    const migrated = await seed('failing', 'privateUpload')
    const refusedRowBefore = (await storedRows('failing')).find((row) => row.id === refused.id)
    harness.cloudinary.failOn('rename', refused.publicId, {
      message: 'Resource not found',
      httpCode: 404,
    })
    // Cloudinary has no authenticated asset under that public ID either.
    harness.cloudinary.failOn('resource', refused.publicId, { message: 'Not Found', httpCode: 404 })

    const report = await migrate('failing')

    expect(report.failed).toEqual([
      { id: refused.id, publicId: refused.publicId, error: 'Resource not found' },
    ])
    expect(idsOf(report.changed)).toEqual([migrated.id])
    const rows = await storedRows('failing')
    expect(rows.find((row) => row.id === refused.id)).toEqual(refusedRowBefore)
    expect(rows.find((row) => row.id === migrated.id)?.cloudinaryType).toBe('authenticated')
  })

  it('moves the asset back when the database write fails, so a later run retries it', async () => {
    const refused = await seed('unwritable', 'privateUpload')
    const migrated = await seed('unwritable', 'privateUpload')
    const refusedRowBefore = (await storedRows('unwritable')).find((row) => row.id === refused.id)
    const callsBefore = harness.cloudinary.calls.length
    const refusal = refuseWrite(refused.id)

    const report = await migrate('unwritable')
    refusal.mockRestore()

    expect(report.failed).toEqual([
      { id: refused.id, publicId: refused.publicId, error: 'Write refused' },
    ])
    expect(idsOf(report.changed)).toEqual([migrated.id])
    const renames = callsSince(callsBefore, 'rename', refused.publicId)
    expect(renames.map((call) => [call.options.type, call.options.to_type])).toEqual([
      ['upload', 'authenticated'],
      ['authenticated', 'upload'],
    ])
    const rows = await storedRows('unwritable')
    expect(rows.find((row) => row.id === refused.id)).toEqual(refusedRowBefore)
    expect(rows.find((row) => row.id === migrated.id)?.cloudinaryType).toBe('authenticated')
  })

  it('says the asset and the row disagree when moving the asset back fails too', async () => {
    const refused = await seed('stuck', 'privateUpload')
    const refusal = refuseWrite(refused.id)
    // The rename to authenticated goes through. The rename back fails.
    harness.cloudinary.failOn(
      'rename',
      refused.publicId,
      { message: 'Rate limited', httpCode: 420 },
      {
        skip: 1,
        times: 1,
      },
    )
    const callsBefore = harness.cloudinary.calls.length

    const report = await migrate('stuck')
    refusal.mockRestore()

    const renames = callsSince(callsBefore, 'rename', refused.publicId)
    expect(renames.map((call) => [call.options.to_type, call.error?.message])).toEqual([
      ['authenticated', undefined],
      ['upload', 'Rate limited'],
    ])
    expect(report.failed).toHaveLength(1)
    const { error } = report.failed[0]
    expect(error).toContain('Write refused')
    expect(error).toContain('Rate limited')
    expect(error).toContain(`${refused.publicId} is now authenticated`)
  })

  it('migrates a document whose asset an earlier run already moved to authenticated', async () => {
    // The row still records upload, so the rename looks for an upload asset that is gone.
    const stuck = await seed('recovered', 'privateUpload')
    noUploadAsset(stuck.publicId)
    harness.cloudinary.failOn('rename', stuck.publicId, {
      message: 'Resource not found',
      httpCode: 404,
    })
    const callsBefore = harness.cloudinary.calls.length

    const report = await migrate('recovered')

    expect(idsOf(report.changed)).toEqual([stuck.id])
    expect(report.failed).toEqual([])
    // It finds the authenticated asset, and checks that no upload asset still serves.
    const lookups = callsSince(callsBefore, 'resource', stuck.publicId)
    expect(lookups.map((call) => call.options)).toEqual([
      { type: 'authenticated', resource_type: 'image' },
      { type: 'upload', resource_type: 'image' },
    ])
    const [row] = await storedRows('recovered')
    expect(row.cloudinaryType).toBe('authenticated')
    for (const field of URL_FIELDS) expect(row[field] ?? null, field).toBeNull()
  })

  it('does not recover a document when an upload asset shares its public ID', async () => {
    const doc = await seed('duplicate', 'privateUpload')
    const [rowBefore] = await storedRows('duplicate')
    // The rename fails for another reason, and both an authenticated and an upload asset exist.
    harness.cloudinary.failOn('rename', doc.publicId, {
      message: 'Asset already exists',
      httpCode: 400,
    })

    const report = await migrate('duplicate')

    expect(report.changed).toEqual([])
    expect(report.failed).toHaveLength(1)
    expect(report.failed[0].error).toContain(
      `An upload asset and an authenticated asset share the public ID ${doc.publicId}`,
    )
    expect(report.failed[0].error).toContain('the public one still serves')
    expect(await storedRows('duplicate')).toEqual([rowBefore])
  })

  it('names the rename error and the lookup error when the lookup fails for another reason', async () => {
    const doc = await seed('lookupFails', 'privateUpload')
    const [rowBefore] = await storedRows('lookupFails')
    harness.cloudinary.failOn('rename', doc.publicId, {
      message: 'Resource not found',
      httpCode: 404,
    })
    harness.cloudinary.failOn('resource', doc.publicId, {
      message: 'Rate Limit Exceeded',
      httpCode: 420,
    })

    const report = await migrate('lookupFails')

    expect(report.failed).toHaveLength(1)
    expect(report.failed[0].error).toContain('Resource not found')
    expect(report.failed[0].error).toContain('Rate Limit Exceeded')
    expect(await storedRows('lookupFails')).toEqual([rowBefore])
  })

  it('leaves a recovered asset authenticated when its database write fails', async () => {
    const stuck = await seed('recoveredUnwritable', 'privateUpload')
    noUploadAsset(stuck.publicId)
    // Only the rename to authenticated fails, so any later rename would go through.
    harness.cloudinary.failOn(
      'rename',
      stuck.publicId,
      { message: 'Resource not found', httpCode: 404 },
      { times: 1 },
    )
    const refusal = refuseWrite(stuck.id)
    const callsBefore = harness.cloudinary.calls.length

    const report = await migrate('recoveredUnwritable')
    refusal.mockRestore()

    expect(report.failed.map((entry) => entry.id)).toEqual([stuck.id])
    // The asset was authenticated before this run, so nothing moves it to upload.
    const renames = callsSince(callsBefore, 'rename', stuck.publicId)
    expect(renames.filter((call) => !call.error)).toEqual([])
  })

  it('reports the rename error when Cloudinary has no authenticated asset either', async () => {
    const missing = await seed('unrecoverable', 'privateUpload')
    const [rowBefore] = await storedRows('unrecoverable')
    harness.cloudinary.failOn('rename', missing.publicId, {
      message: 'Resource not found',
      httpCode: 404,
    })
    harness.cloudinary.failOn('resource', missing.publicId, { message: 'Not Found', httpCode: 404 })

    const report = await migrate('unrecoverable')

    expect(report.failed).toEqual([
      { id: missing.id, publicId: missing.publicId, error: 'Resource not found' },
    ])
    expect(await storedRows('unrecoverable')).toEqual([rowBefore])
  })

  it('migrates a file the read path treats as private by its stored type alone', async () => {
    const unflagged = await seed('unflagged', 'unflaggedAuthenticated')
    const callsBefore = harness.cloudinary.calls.length

    const report = await migrate('unflagged')

    expect(idsOf(report.changed)).toEqual([unflagged.id])
    expect(harness.cloudinary.calls).toHaveLength(callsBefore)
    const [row] = await storedRows('unflagged')
    expect(row.cloudinaryType).toBe('authenticated')
    for (const field of URL_FIELDS) expect(row[field] ?? null, field).toBeNull()
  })

  it('names a public copy from its stored public ID first, then from the naming rule', async () => {
    // A private file with its preview on, then the given copy fields written over it.
    const seedWithCopy = async (fields: (publicId: string) => Record<string, unknown>) => {
      const doc = await seed('storedCopies', 'privateUpload')
      await harness.payload.db.updateOne({
        collection: 'storedCopies',
        id: doc.id,
        data: fields(doc.publicId),
        req: await localReq(),
      })
      return doc
    }
    // The stored ID and the naming rule agree.
    const agrees = await seedWithCopy((publicId) => ({
      transformationType: 'blur',
      publicTransformationPublicId: `${publicId}_public_blur`,
    }))
    // The type changed after the copy was made, so each names a different copy.
    const differs = await seedWithCopy((publicId) => ({
      transformationType: 'blur',
      publicTransformationPublicId: `${publicId}_public_watermark`,
    }))
    // The preview is off now, so only the stored ID names a copy.
    const storedOnly = await seedWithCopy((publicId) => ({
      hasPublicTransformation: false,
      publicTransformationPublicId: `${publicId}_public_watermark`,
    }))

    const report = await migrate('storedCopies', true)

    expect(report.publicCopies).toEqual([
      { id: agrees.id, publicId: `${agrees.publicId}_public_blur` },
      { id: differs.id, publicId: `${differs.publicId}_public_watermark` },
      { id: differs.id, publicId: `${differs.publicId}_public_blur` },
      { id: storedOnly.id, publicId: `${storedOnly.publicId}_public_watermark` },
    ])
  })

  it('lists no public copy for a public file', async () => {
    await seed('copies', 'publicWithPreview')

    const report = await migrate('copies')

    expect(report.publicCopies).toEqual([])
  })

  describe('on a collection with drafts', () => {
    it('migrates every version row of a document', async () => {
      const doc = await seed('drafted', 'privateUpload')
      // An older upload of the document, replaced since.
      await seedVersion('drafted', doc.id, {
        ...doc.data,
        cloudinaryPublicId: 'originals/replaced',
        ...uploadURLs('originals/replaced'),
      })
      await seedVersion('drafted', doc.id, { ...doc.data, _status: 'published' })
      await seedVersion('drafted', doc.id, { ...doc.data, _status: 'draft' })

      const report = await migrate('drafted')

      expect(idsOf(report.changed)).toEqual([doc.id])
      const [replaced, ...current] = await versionRows('drafted', doc.id)
      expect(current).toHaveLength(2)
      for (const version of current) {
        expect(version.cloudinaryType).toBe('authenticated')
        expect(version.cloudinaryPublicId).toBe(doc.publicId)
        expect(version.filename).toBe(doc.data.filename)
        for (const field of URL_FIELDS) expect(version[field] ?? null, field).toBeNull()
      }
      // A version of another asset keeps its asset, records the type its stored URLs show, and
      // loses those URLs. Without the type, the read path would take it for authenticated.
      expect(replaced.cloudinaryPublicId).toBe('originals/replaced')
      expect(replaced.cloudinaryType).toBe('upload')
      for (const field of URL_FIELDS) expect(replaced[field] ?? null, field).toBeNull()
    })

    it('serves a migrated draft through a signed authenticated URL', async () => {
      const doc = await seed('readableDrafts', 'privateUpload')
      await harness.payload.db.updateOne({
        collection: 'readableDrafts',
        id: doc.id,
        data: { _status: 'published', title: 'Published' },
        req: await localReq(),
      })
      await seedVersion('readableDrafts', doc.id, {
        ...doc.data,
        _status: 'published',
        title: 'Published',
      })
      await seedVersion('readableDrafts', doc.id, { ...doc.data, _status: 'draft', title: 'Draft' })
      await migrate('readableDrafts')

      // Read as a logged-in user, the way a caller previews the draft.
      const user = await harness.userOf(await harness.createUser())
      const draft = await harness.payload.findByID({
        collection: 'readableDrafts',
        id: doc.id,
        draft: true,
        req: await createLocalReq({ user }, harness.payload),
        overrideAccess: false,
      })

      expect(draft.title).toBe('Draft')
      // The SDK appends an analytics query string, which isn't part of the signed path.
      expect(String(draft.url).split('?')[0]).toMatch(
        new RegExp(`^${BASE}/authenticated/s--[\\w-]{8}--/v\\d+/${doc.publicId}\\.png$`),
      )
    })

    it.each([
      ['a version row', 'updateVersion'],
      ['the document row', 'updateOne'],
    ] as const)(
      'leaves every row and the asset as they were when the write of %s fails',
      async (_label, method) => {
        const doc = await seed('draftedFails', 'privateUpload')
        await seedVersion('draftedFails', doc.id, { ...doc.data, _status: 'published' })
        await seedVersion('draftedFails', doc.id, { ...doc.data, _status: 'draft' })
        const rowBefore = (await storedRows('draftedFails')).find((row) => row.id === doc.id)
        const versionsBefore = await versionRows('draftedFails', doc.id)
        const callsBefore = harness.cloudinary.calls.length
        // The second version row, or the document row, refuses its write.
        let writes = 0
        const write = harness.payload.db[method]
        const refusal = vi.spyOn(harness.payload.db, method).mockImplementation((async (
          args: any,
        ) => {
          writes += 1
          if (method === 'updateOne' || writes === 2) throw new Error('Write refused')
          return (write as any).call(harness.payload.db, args)
        }) as any)

        const report = await migrate('draftedFails')
        refusal.mockRestore()

        expect(report.failed.map((entry) => entry.id)).toContain(doc.id)
        expect((await storedRows('draftedFails')).find((row) => row.id === doc.id)).toEqual(
          rowBefore,
        )
        expect(await versionRows('draftedFails', doc.id)).toEqual(versionsBefore)
        const renames = callsSince(callsBefore, 'rename', doc.publicId)
        expect(renames.map((call) => call.options.to_type)).toEqual(['authenticated', 'upload'])
      },
    )
  })

  it('migrates every document when the collection holds more than one page', async () => {
    const seededIds: number[] = []
    for (let i = 0; i < 250; i += 1) seededIds.push((await seed('many', 'privateAuthenticated')).id)

    const report = await migrate('many')

    expect(idsOf(report.changed)).toEqual(seededIds.sort())
    const rows = await storedRows('many')
    expect(rows.filter((row) => row.cloudinaryType !== 'authenticated')).toEqual([])
  })
})
