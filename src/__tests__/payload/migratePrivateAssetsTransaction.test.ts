import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type CollectionConfig,
  type PayloadRequest,
} from 'payload'
import { migratePrivateAssets, MigrationStoppedError } from '../../index'
import { startPayload, TEST_CLOUD, type PayloadHarness } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const VERSION = 1690000000

// A collection hook that throws for this document, as a site's own validation might.
const REFUSED_FILENAME = 'refused-by-hook.png'

const media: CollectionConfig = {
  slug: 'media',
  upload: true,
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (originalDoc?.filename === REFUSED_FILENAME) throw new Error('Refused by a hook')
        return data
      },
    ],
  },
  fields: [],
}

// A collection whose database write fails for one document, as a lost connection would.
const stopped: CollectionConfig = { slug: 'stopped', upload: true, fields: [] }

// A Payload migration runs its `up` function inside one transaction. When any Local API
// operation inside it fails, Payload rolls back that whole transaction, so a write refused by a
// collection hook would undo every write before it.
describe('migratePrivateAssets inside a migration transaction', () => {
  let harness: PayloadHarness
  let req: PayloadRequest | undefined

  beforeAll(async () => {
    harness = await startPayload({
      collections: [media, stopped],
      pluginCollections: { media: { privateFiles: true }, stopped: { privateFiles: true } },
      transactionOptions: {},
    })
  })

  afterAll(async () => {
    // A failed assertion leaves the transaction open, and SQLite would hold its lock.
    if (req?.transactionID) await killTransaction(req)
    await harness?.stop()
  })

  // Writes a 1.2.x private `upload` row straight to the database, outside any transaction.
  const seed = async (filename: string, collection: 'media' | 'stopped' = 'media') => {
    const publicId = `originals/${filename.replace('.png', '')}`
    const url = `${BASE}/upload/v${VERSION}/${publicId}.png`
    const doc = await harness.payload.db.create({
      collection,
      data: {
        filename,
        mimeType: 'image/png',
        cloudinaryPublicId: publicId,
        cloudinaryVersion: VERSION,
        cloudinaryResourceType: 'image',
        cloudinaryFormat: 'png',
        isPrivate: true,
        requiresSignedURL: true,
        url,
        cloudinaryUrl: url,
        originalUrl: url,
      },
      req: await createLocalReq({}, harness.payload),
    })
    return doc.id as number
  }

  it('keeps every document migrated when a collection hook throws for one of them', async () => {
    const ids = [
      await seed('before-hook.png'),
      await seed(REFUSED_FILENAME),
      await seed('after-hook.png'),
    ]
    req = await createLocalReq({}, harness.payload)
    expect(await initTransaction(req)).toBe(true)

    const report = await migratePrivateAssets({
      payload: harness.payload,
      req,
      collection: 'media',
    })
    await commitTransaction(req)

    const { docs } = await harness.payload.db.find<Record<string, any>>({
      collection: 'media',
      pagination: false,
      sort: 'id',
      req: await createLocalReq({}, harness.payload),
    })
    expect(docs.map((row) => [row.id, row.cloudinaryType, row.originalUrl ?? null])).toEqual(
      ids.map((id) => [id, 'authenticated', null]),
    )
    expect(report.failed).toEqual([])
  })

  describe('when a database write fails', () => {
    const rowsOf = async () =>
      (
        await harness.payload.db.find<Record<string, any>>({
          collection: 'stopped',
          pagination: false,
          sort: 'id',
          req: await createLocalReq({}, harness.payload),
        })
      ).docs

    it('stops, so the rollback leaves no half-migrated run, and a rerun recovers', async () => {
      const ids = [
        await seed('first.png', 'stopped'),
        await seed('refused.png', 'stopped'),
        await seed('never-reached.png', 'stopped'),
      ]
      const publicIds = (await rowsOf()).map((row) => row.cloudinaryPublicId as string)
      const rowsBefore = await rowsOf()
      const callsBefore = harness.cloudinary.calls.length
      const updateOne = harness.payload.db.updateOne
      const refusal = vi.spyOn(harness.payload.db, 'updateOne').mockImplementation(async (args) => {
        if (args.id === ids[1]) throw new Error('connection reset')
        return updateOne.call(harness.payload.db, args)
      })
      req = await createLocalReq({}, harness.payload)
      expect(await initTransaction(req)).toBe(true)

      const run = migratePrivateAssets({ payload: harness.payload, req, collection: 'stopped' })

      const error = await run.then(
        () => undefined,
        (rejection: unknown) => rejection,
      )
      refusal.mockRestore()
      // Payload's migration runner rolls the transaction back when up() throws.
      await killTransaction(req)
      expect(error, 'the run stops at the failed write').toBeDefined()
      expect(error).toBeInstanceOf(MigrationStoppedError)
      const { message, report } = error as MigrationStoppedError
      expect(message).toContain('connection reset')
      expect(message).toContain('rolls back')
      expect(message).toContain('renames stay')
      expect(report.changed.map((entry) => entry.id)).toEqual([ids[0]])
      expect(report.failed.map((entry) => entry.id)).toEqual([ids[1]])
      expect(await rowsOf()).toEqual(rowsBefore)
      const renames = harness.cloudinary.calls
        .slice(callsBefore)
        .filter((call) => call.method === 'rename')
        .map((call) => [call.publicId, call.options.to_type])
      // The first asset stays authenticated, the refused one moves back, the third is untouched.
      expect(renames).toEqual([
        [publicIds[0], 'authenticated'],
        [publicIds[1], 'authenticated'],
        [publicIds[1], 'upload'],
      ])

      // On the rerun, the first asset is already authenticated, so its rename finds nothing.
      harness.cloudinary.failOn(
        'rename',
        publicIds[0],
        { message: `Resource not found - ${publicIds[0]}`, httpCode: 404 },
        { times: 1 },
      )
      harness.cloudinary.failOn(
        'resource',
        publicIds[0],
        { message: `Resource not found - ${publicIds[0]}`, httpCode: 404 },
        { type: 'upload' },
      )
      const rerun = await migratePrivateAssets({
        payload: harness.payload,
        req: await createLocalReq({}, harness.payload),
        collection: 'stopped',
      })

      expect(rerun.failed).toEqual([])
      expect(rerun.changed.map((entry) => entry.id)).toEqual(ids)
      expect((await rowsOf()).map((row) => row.cloudinaryType)).toEqual(
        ids.map(() => 'authenticated'),
      )
    })
  })
})
