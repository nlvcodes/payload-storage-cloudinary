import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createPayloadRequest,
  initTransaction,
  killTransaction,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'
import { writeStoredRow, writeVersionRow, type VersionRow } from '../../helpers/storedRows'
import { startPayload, type PayloadHarness } from './harness'

// A required field gets a NOT NULL column, a localized field a table of its own with one row per
// locale, and a join field no column at all. A write of a few fields keeps every one of them.
const collections: CollectionConfig[] = [
  {
    slug: 'rows',
    upload: true,
    versions: true,
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'caption', type: 'text', localized: true, required: true },
      { name: 'notes', type: 'join', collection: 'notes', on: 'row' },
    ],
  },
  {
    slug: 'notes',
    fields: [{ name: 'row', type: 'relationship', relationTo: 'rows' }],
  },
]

const CAPTION = { en: 'An English caption', es: 'A Spanish caption' }

describe('the stored-row writes the hooks and the migration share', () => {
  let harness: PayloadHarness
  let transactionReq: PayloadRequest | undefined
  let seeded = 0

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections: { rows: { privateFiles: true } },
      localization: { locales: ['en', 'es'], defaultLocale: 'en' },
      transactionOptions: {},
    })
  })

  afterAll(async () => {
    // A failed assertion leaves the transaction open, and SQLite would hold its lock.
    if (transactionReq?.transactionID) await killTransaction(transactionReq)
    await harness?.stop()
  })

  const localReq = () => createPayloadRequest({ payload: harness.payload })

  // Writes a row straight to the database, with a note that joins it.
  const seed = async () => {
    seeded += 1
    const req = await localReq()
    const row = await harness.payload.db.create({
      collection: 'rows',
      data: {
        filename: `row-${seeded}.png`,
        mimeType: 'image/png',
        title: `Title ${seeded}`,
        caption: CAPTION,
        cloudinaryPublicId: `originals/row-${seeded}`,
        cloudinaryType: 'upload',
        isPrivate: false,
      },
      req,
    })
    await harness.payload.db.create({ collection: 'notes', data: { row: row.id }, req })
    return row.id as number
  }

  const storedRow = async (id: number) =>
    harness.payload.db.findOne<Record<string, any>>({
      collection: 'rows',
      where: { id: { equals: id } },
      locale: 'all',
      req: await localReq(),
    })

  describe('writeStoredRow', () => {
    it('writes the given fields and keeps every other column, in every locale', async () => {
      const id = await seed()

      await writeStoredRow(harness.payload, await localReq(), 'rows', id, {
        cloudinaryType: 'authenticated',
        isPrivate: true,
      })

      const row = await storedRow(id)
      expect(row?.cloudinaryType).toBe('authenticated')
      expect(row?.isPrivate).toBe(true)
      expect(row?.title).toBe(`Title ${seeded}`)
      expect(row?.caption).toEqual(CAPTION)
      expect(row?.filename).toBe(`row-${seeded}.png`)
      expect(row?.cloudinaryPublicId).toBe(`originals/row-${seeded}`)
    })

    it('leaves the documents that join the row joined to it', async () => {
      const id = await seed()

      await writeStoredRow(harness.payload, await localReq(), 'rows', id, { isPrivate: true })

      const row = await storedRow(id)
      expect(row?.notes?.docs).toHaveLength(1)
    })

    it('throws when the row no longer exists', async () => {
      await expect(
        writeStoredRow(harness.payload, await localReq(), 'rows', 999_999, { isPrivate: true }),
      ).rejects.toThrow('Document 999999 of rows no longer exists')
    })

    it("joins the request's transaction", async () => {
      const id = await seed()
      const req = await localReq()
      transactionReq = req
      expect(await initTransaction(req)).toBe(true)

      await writeStoredRow(harness.payload, req, 'rows', id, { cloudinaryType: 'authenticated' })
      await killTransaction(req)

      expect((await storedRow(id))?.cloudinaryType).toBe('upload')
    })
  })

  // The stored version rows of a document, every locale included.
  const versionRows = async (parent: number) =>
    (
      await harness.payload.db.findVersions<Record<string, any>>({
        collection: 'rows',
        where: { parent: { equals: parent } },
        locale: 'all',
        pagination: false,
        sort: 'id',
        req: await localReq(),
      })
    ).docs as VersionRow[]

  describe('writeVersionRow', () => {
    // Writes a version row of the document straight to the database.
    const seedVersion = async (parent: number) => {
      const version = await storedRow(parent)
      const now = new Date().toISOString()
      await harness.payload.db.createVersion({
        collectionSlug: 'rows',
        parent,
        versionData: version as any,
        autosave: false,
        createdAt: now,
        updatedAt: now,
        req: await localReq(),
      })
      return (await versionRows(parent))[0]
    }

    it("writes the version's document data and keeps the row's other columns", async () => {
      const id = await seed()
      const before = await seedVersion(id)

      await writeVersionRow(harness.payload, await localReq(), 'rows', before, {
        ...before.version,
        cloudinaryType: 'authenticated',
      })

      const [after] = await versionRows(id)
      expect(after.id).toBe(before.id)
      expect(after.parent).toBe(id)
      expect(after.createdAt).toBe(before.createdAt)
      expect(after.version.cloudinaryType).toBe('authenticated')
      expect(after.version.title).toBe(`Title ${seeded}`)
      expect(after.version.caption).toEqual(CAPTION)
    })

    it("joins the request's transaction", async () => {
      const id = await seed()
      const before = await seedVersion(id)
      const req = await localReq()
      transactionReq = req
      expect(await initTransaction(req)).toBe(true)

      await writeVersionRow(harness.payload, req, 'rows', before, {
        ...before.version,
        cloudinaryType: 'authenticated',
      })
      await killTransaction(req)

      expect((await versionRows(id))[0].version.cloudinaryType).toBe('upload')
    })
  })
})
