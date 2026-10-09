import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'
import { migratePrivateAssets } from '../../index'
import { startPayload, TEST_CLOUD, type PayloadHarness } from './harness'

// A site's own collections often have a required field. The SQL adapters give a required field
// a NOT NULL column, in the document table and, without drafts, in the version table too.
const required: CollectionConfig = {
  slug: 'required',
  upload: true,
  versions: true,
  fields: [{ name: 'title', type: 'text', required: true }],
}

// A localized field lives in a table of its own, one row per locale, so a write must keep every
// locale of it.
const localized: CollectionConfig = {
  slug: 'localized',
  upload: true,
  versions: true,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'caption', type: 'text', localized: true, required: true },
  ],
}

// The same collection again, migrated inside a transaction, as a Payload migration on Postgres is.
const requiredInTransaction: CollectionConfig = { ...required, slug: 'requiredInTransaction' }

type Slug = 'required' | 'localized' | 'requiredInTransaction'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const VERSION = 1690000000

const URL_FIELDS = [
  'url',
  'thumbnailURL',
  'cloudinaryUrl',
  'originalUrl',
  'transformedUrl',
  'previewUrl',
  'publicTransformationUrl',
] as const

const CAPTION = { en: 'An English caption', es: 'A Spanish caption' }

describe('migratePrivateAssets on a collection with required and localized fields', () => {
  let harness: PayloadHarness
  let seeded = 0
  let transactionReq: PayloadRequest | undefined

  beforeAll(async () => {
    harness = await startPayload({
      collections: [required, localized, requiredInTransaction],
      pluginCollections: {
        required: { privateFiles: true },
        localized: { privateFiles: true },
        requiredInTransaction: { privateFiles: true },
      },
      localization: { locales: ['en', 'es'], defaultLocale: 'en' },
      transactionOptions: {},
    })
  })

  afterAll(async () => {
    // A failed run leaves the transaction open, and SQLite would hold its lock.
    if (transactionReq?.transactionID) await killTransaction(transactionReq)
    await harness?.stop()
  })

  const localReq = () => createLocalReq({}, harness.payload)

  // Writes a 1.2.x private `upload` row straight to the database, then two version rows of it.
  const seed = async (collection: Slug) => {
    seeded += 1
    const publicId = `originals/${collection}-${seeded}`
    const url = `${BASE}/upload/v${VERSION}/${publicId}.png`
    const data = {
      filename: `${collection}-${seeded}.png`,
      mimeType: 'image/png',
      title: `Title ${seeded}`,
      ...(collection === 'localized' ? { caption: CAPTION } : {}),
      cloudinaryPublicId: publicId,
      cloudinaryVersion: VERSION,
      cloudinaryResourceType: 'image',
      cloudinaryFormat: 'png',
      isPrivate: true,
      requiresSignedURL: true,
      url,
      thumbnailURL: `${BASE}/upload/c_fill,w_150,h_150/v${VERSION}/${publicId}.png`,
      cloudinaryUrl: url,
      originalUrl: url,
    }
    const doc = await harness.payload.db.create({ collection, data, req: await localReq() })
    for (let i = 0; i < 2; i += 1) {
      const now = new Date().toISOString()
      await harness.payload.db.createVersion({
        collectionSlug: collection,
        parent: doc.id,
        versionData: data as any,
        autosave: false,
        createdAt: now,
        updatedAt: now,
        req: await localReq(),
      })
    }
    return { id: doc.id as number, publicId, data }
  }

  // The stored document row, every locale included.
  const storedRow = async (collection: Slug, id: number) =>
    harness.payload.db.findOne<Record<string, any>>({
      collection,
      where: { id: { equals: id } },
      locale: 'all',
      req: await localReq(),
    })

  // The stored version rows of a document, every locale included.
  const versionRows = async (collection: Slug, parent: number) =>
    (
      await harness.payload.db.findVersions<Record<string, any>>({
        collection,
        where: { parent: { equals: parent } },
        locale: 'all',
        pagination: false,
        sort: 'id',
        req: await localReq(),
      })
    ).docs.map((row) => row.version)

  const expectMigrated = (
    row: Record<string, any> | null,
    doc: Awaited<ReturnType<typeof seed>>,
  ) => {
    expect(row?.cloudinaryType).toBe('authenticated')
    expect(row?.cloudinaryPublicId).toBe(doc.publicId)
    for (const field of URL_FIELDS) expect(row?.[field] ?? null, field).toBeNull()
    expect(row?.filename).toBe(doc.data.filename)
    expect(row?.mimeType).toBe('image/png')
    expect(row?.isPrivate).toBe(true)
    expect(row?.title).toBe(doc.data.title)
  }

  describe.each([
    ['required', false],
    ['localized', false],
    ['requiredInTransaction', true],
  ] as const)('on the %s collection', (collection, inTransaction) => {
    let docs: Awaited<ReturnType<typeof seed>>[]
    let report: Awaited<ReturnType<typeof migratePrivateAssets>>

    beforeAll(async () => {
      docs = [await seed(collection), await seed(collection)]
      const req = await localReq()
      if (inTransaction) {
        transactionReq = req
        expect(await initTransaction(req)).toBe(true)
      }
      report = await migratePrivateAssets({ payload: harness.payload, req, collection })
      if (inTransaction) await commitTransaction(req)
    })

    it('migrates every document', () => {
      expect(report.failed).toEqual([])
      expect(report.changed.map((entry) => entry.id).sort()).toEqual(docs.map((doc) => doc.id))
    })

    it('changes the type, clears the stored URLs, and keeps the other fields', async () => {
      for (const doc of docs) {
        const row = await storedRow(collection, doc.id)
        expectMigrated(row, doc)
        if (collection === 'localized') expect(row?.caption).toEqual(CAPTION)
      }
    })

    it('migrates the version rows and keeps their other fields', async () => {
      for (const doc of docs) {
        const versions = await versionRows(collection, doc.id)
        expect(versions).toHaveLength(2)
        for (const version of versions) {
          expectMigrated(version, doc)
          if (collection === 'localized') expect(version.caption).toEqual(CAPTION)
        }
      }
    })

    it('skips every document on a second run', async () => {
      const rerun = await migratePrivateAssets({
        payload: harness.payload,
        req: await localReq(),
        collection,
      })

      expect(rerun.changed).toEqual([])
      expect(rerun.failed).toEqual([])
      expect(rerun.skipped.map((entry) => entry.id).sort()).toEqual(docs.map((doc) => doc.id))
    })
  })
})
