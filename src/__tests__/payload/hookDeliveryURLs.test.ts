import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPayloadRequest, type CollectionConfig } from 'payload'
import { STORED_URL_FIELDS } from '../../helpers/deliveryURL'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const uploadCollection = (slug: string): CollectionConfig => ({
  slug,
  upload: {
    // A legacy record is seeded without a file.
    filesRequiredOnCreate: false,
    // Payload otherwise reads thumbnailURL back as null, hiding the stored one.
    adminThumbnail: ({ doc }) => doc.thumbnailURL as string,
  },
  fields: [],
})

const presetTransformations = (preserveOriginal: boolean) => ({
  // The `default` key makes the plugin read this as the organized format.
  default: {},
  preserveOriginal,
  enablePresetSelection: true,
  presets: [{ name: 'thumb', label: 'Thumb', transformations: { width: 300, crop: 'scale' } }],
  publicTransformation: { enabled: true, watermark: { defaultText: 'Preview' } },
})

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A signed authenticated URL. `transformation` is a regex fragment ending in `/`, or empty.
const signedURL = (publicId: string, version: number, transformation = '') =>
  new RegExp(
    `^${BASE}/authenticated/s--[\\w-]{8}--/${transformation}v${version}/${escape(publicId)}\\.png$`,
  )

// An unsigned upload URL. `transformation` is a regex fragment ending in `/`, or empty.
const uploadURL = (publicId: string, version: number, transformation = '') =>
  new RegExp(`^${BASE}/upload/${transformation}v${version}/${escape(publicId)}\\.png$`)

// The preset, then the watermark layer on top.
const THUMB = 'c_scale,w_300/'
const THUMB_THEN_WATERMARK = 'c_scale,w_300/.+/'

describe('hooks build delivery URLs for the stored delivery type', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [
        uploadCollection('previews'),
        uploadCollection('staged'),
        uploadCollection('folders'),
      ],
      pluginCollections: {
        // On a publicTransformation collection, only customAuthCheck grants the original.
        previews: {
          privateFiles: { enabled: true, customAuthCheck: (req) => Boolean(req.user) },
          transformations: presetTransformations(true),
        },
        // Without preserveOriginal, the preview still comes from the afterRead hook.
        staged: { privateFiles: true, transformations: presetTransformations(false) },
        folders: { privateFiles: true, folder: { path: 'originals', enableDynamic: true } },
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (
    collection: string,
    filename: string,
    data: Record<string, unknown> = {},
  ) => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename, data),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    const call = harness.cloudinary.calls.find(
      (c) => c.method === 'upload_stream' && c.result.public_id === doc.cloudinaryPublicId,
    )
    return { doc, version: call!.result.version as number }
  }

  const read = async (collection: string, id: string | number) => {
    const res = await harness.request(`/api/${collection}/${id}`, { user })
    expect(res.status).toBe(200)
    return res.json()
  }

  const update = async (collection: string, id: string | number, data: Record<string, unknown>) => {
    const res = await harness.request(`/api/${collection}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      user,
    })
    expect(res.status).toBe(200)
    return (await res.json()).doc
  }

  it('signs the preview and transformed URLs of an authenticated original', async () => {
    const { doc, version } = await upload('previews', 'signed-preview.png', {
      hasPublicTransformation: true,
      transformationPreset: ['thumb'],
    })

    const readDoc = await read('previews', doc.id)

    expect(pathOf(readDoc.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, THUMB_THEN_WATERMARK),
    )
    expect(pathOf(readDoc.transformedUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, THUMB),
    )
  })

  it('signs the preview after only the preset changes', async () => {
    const { doc, version } = await upload('staged', 'staged.png', {
      hasPublicTransformation: true,
    })

    const updated = await update('staged', doc.id, { transformationPreset: ['thumb'] })

    expect(pathOf(updated.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, THUMB_THEN_WATERMARK),
    )
  })

  it('signs the thumbnail of a private file moved to another folder', async () => {
    const { doc } = await upload('folders', 'moved.png')

    const updated = await update('folders', doc.id, {
      cloudinaryPublicId: doc.cloudinaryPublicId,
      cloudinaryFolder: 'moved',
    })
    const rename = harness.cloudinary.calls.find(
      (c) => c.method === 'rename' && c.publicId === doc.cloudinaryPublicId,
    )

    expect(rename).toBeDefined()
    expect(updated.cloudinaryPublicId).toMatch(/^moved\//)
    expect(pathOf(updated.thumbnailURL)).toMatch(
      signedURL(updated.cloudinaryPublicId, rename!.result.version, '.+/'),
    )
    // The signed URLs are built at read time. The row stores none of them.
    const row = (await harness.payload.db.findOne<Record<string, any>>({
      collection: 'folders',
      where: { id: { equals: doc.id } },
    }))!
    expect(row.cloudinaryPublicId).toBe(updated.cloudinaryPublicId)
    for (const field of STORED_URL_FIELDS) expect(row[field] ?? null, field).toBeNull()
  })

  describe('a legacy private record stored as upload', () => {
    const LEGACY_ID = 'legacy/photo'
    const LEGACY_VERSION = 1600000000
    let created: Record<string, any>

    beforeAll(async () => {
      // Seeding a pre-1.3.0 row is a trusted server job, so it skips access on purpose.
      const req = await createPayloadRequest({ payload: harness.payload })
      created = await harness.payload.create({
        collection: 'previews',
        data: {
          cloudinaryPublicId: LEGACY_ID,
          cloudinaryVersion: LEGACY_VERSION,
          cloudinaryResourceType: 'image',
          cloudinaryFormat: 'png',
          originalUrl: `${BASE}/upload/v${LEGACY_VERSION}/${LEGACY_ID}.png`,
          cloudinaryUrl: `${BASE}/upload/v${LEGACY_VERSION}/${LEGACY_ID}.png`,
          isPrivate: true,
          requiresSignedURL: true,
          hasPublicTransformation: true,
          transformationPreset: ['thumb'],
        },
        req,
        overrideAccess: true,
      })
    })

    it('gets unsigned upload URLs from afterRead', async () => {
      const readDoc = await read('previews', created.id)

      expect(pathOf(readDoc.url)).toMatch(uploadURL(LEGACY_ID, LEGACY_VERSION))
      expect(pathOf(readDoc.transformedUrl)).toMatch(uploadURL(LEGACY_ID, LEGACY_VERSION, THUMB))
      expect(pathOf(readDoc.previewUrl)).toMatch(
        uploadURL(LEGACY_ID, LEGACY_VERSION, THUMB_THEN_WATERMARK),
      )
    })
  })
})
