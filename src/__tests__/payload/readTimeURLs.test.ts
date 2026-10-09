import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type CollectionConfig } from 'payload'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

// Anyone reads the document. customAuthCheck gives the original to logged-in readers only, so a
// logged-in reader gets `original` and an anonymous reader gets `none`.
const readable = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  access: { read: () => true },
  fields: [],
})

const collections = [readable('media'), readable('presets'), readable('locked'), readable('plain')]

const privateFiles = { enabled: true, customAuthCheck: (req: any) => Boolean(req.user) }

const presetTransformations = {
  default: {},
  preserveOriginal: true,
  enablePresetSelection: true,
  presets: [{ name: 'thumb', label: 'Thumb', transformations: { width: 300, crop: 'scale' } }],
}

const pluginCollections = {
  media: { privateFiles },
  // No privateFiles and no presets, like `media: true`
  plain: true,
  // Nobody gets the original, not even the uploader.
  locked: {
    privateFiles: { enabled: true, customAuthCheck: () => false },
    transformations: presetTransformations,
  },
  presets: {
    privateFiles,
    transformations: {
      default: {},
      preserveOriginal: true,
      enablePresetSelection: true,
      presets: [{ name: 'thumb', label: 'Thumb', transformations: { width: 300, crop: 'scale' } }],
      publicTransformation: { enabled: true, watermark: { defaultText: 'Preview' } },
    },
  },
}

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A signed authenticated URL. `transformation` is a regex fragment ending in `/`, or empty.
const signedURL = (publicId: string, version: number, transformation = '') =>
  new RegExp(
    `^${BASE}/authenticated/s--[\\w-]{8}--/${transformation}v${version}/${escape(publicId)}\\.png$`,
  )

// A legacy private row from before 1.3.0, with its stored URLs and no `cloudinaryType`.
const legacyRow = (publicId: string, version: number) => ({
  filename: `${publicId.split('/').pop()}.png`,
  mimeType: 'image/png',
  cloudinaryPublicId: publicId,
  cloudinaryVersion: version,
  cloudinaryResourceType: 'image',
  cloudinaryFormat: 'png',
  cloudinaryUrl: `${BASE}/upload/v${version}/${publicId}.png`,
  originalUrl: `${BASE}/upload/v${version}/${publicId}.png`,
  isPrivate: true,
  requiresSignedURL: true,
})

describe('URLs are built at read time and nothing deliverable is stored', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({ collections, pluginCollections })
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
    const { doc } = await res.json()
    const call = harness.cloudinary.calls.find(
      (c) => c.method === 'upload_stream' && c.result.public_id === doc.cloudinaryPublicId,
    )
    return { doc, version: call!.result.version as number }
  }

  const read = async (id: string | number, asUser?: TestUser, collection = 'media') => {
    const res = await harness.request(`/api/${collection}/${id}`, { user: asUser })
    expect(res.status).toBe(200)
    return res.json()
  }

  it('leaves cloudinaryUrl and originalUrl out of a REST read of a private document', async () => {
    const { doc } = await upload('hidden.png')

    for (const reader of [user, undefined]) {
      const body = await read(doc.id, reader)

      expect(body).not.toHaveProperty('cloudinaryUrl')
      expect(body).not.toHaveProperty('originalUrl')
    }
  })

  it('gives a reader with original access signed, authenticated URLs', async () => {
    const { doc, version } = await upload(
      'original.png',
      { transformationPreset: ['thumb'] },
      'presets',
    )

    const body = await read(doc.id, user, 'presets')

    expect(pathOf(body.url)).toMatch(signedURL(doc.cloudinaryPublicId, version))
    expect(pathOf(body.thumbnailURL)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_fill,f_auto,g_auto,h_150,q_auto,w_150/'),
    )
    expect(pathOf(body.transformedUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/'),
    )
  })

  it('gives a reader with no access no URLs', async () => {
    const { doc } = await upload('none.png', { transformationPreset: ['thumb'] }, 'presets')

    const body = await read(doc.id, undefined, 'presets')

    expect(body.url).toBeNull()
    expect(body.thumbnailURL).toBeNull()
    expect(body.transformedUrl).toBeNull()
    expect(body.previewUrl).toBeNull()
    expect(body).not.toHaveProperty('originalUrl')
    expect(body).not.toHaveProperty('cloudinaryUrl')
  })

  it('gives a reader with preview access the preview only', async () => {
    const { doc, version } = await upload(
      'preview.png',
      { hasPublicTransformation: true, transformationPreset: ['thumb'] },
      'presets',
    )

    const body = await read(doc.id, undefined, 'presets')

    expect(body.url).toBeNull()
    expect(body.thumbnailURL).toBeNull()
    expect(body.transformedUrl).toBeNull()
    expect(body).not.toHaveProperty('originalUrl')
    // The preset, then the watermark layer, signed, so dropping either breaks the URL.
    expect(pathOf(body.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/.*l_text.+/'),
    )
  })

  it('builds a watermark-only preview when no preset is selected', async () => {
    const { doc, version } = await upload(
      'watermark-only.png',
      { hasPublicTransformation: true },
      'presets',
    )

    const body = await read(doc.id, undefined, 'presets')

    expect(pathOf(body.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, '(?!c_scale,w_300/).*l_text.+/'),
    )
  })

  it('applies the access rule to the upload response', async () => {
    const { doc } = await upload('locked.png', { transformationPreset: ['thumb'] }, 'locked')

    expect(doc.url).toBeNull()
    expect(doc.thumbnailURL).toBeNull()
    expect(doc.transformedUrl).toBeNull()
    expect(doc).not.toHaveProperty('originalUrl')
    expect(doc).not.toHaveProperty('cloudinaryUrl')
  })

  it('stores no delivery URL for a private upload', async () => {
    const { doc } = await upload(
      'stored.png',
      { transformationPreset: ['thumb'], hasPublicTransformation: true },
      'presets',
    )

    // The stored row, read past every hook and field access.
    const row = await harness.payload.db.findOne<Record<string, unknown>>({
      collection: 'presets',
      where: { id: { equals: doc.id } },
    })

    expect(row?.cloudinaryPublicId).toBe(doc.cloudinaryPublicId)
    for (const field of [
      'url',
      'thumbnailURL',
      'cloudinaryUrl',
      'originalUrl',
      'transformedUrl',
      'previewUrl',
      'publicTransformationUrl',
    ]) {
      expect(row?.[field] ?? null, field).toBeNull()
    }
  })

  it('resolves the type of a legacy record from its stored original URL', async () => {
    const publicId = 'legacy/photo'
    const version = 1600000000
    // Seeding a pre-1.3.0 row is a trusted server job, so it writes the row directly.
    const legacy = await harness.payload.db.create({
      collection: 'media',
      data: legacyRow(publicId, version),
    })

    const body = await read(legacy.id, user)

    expect(pathOf(body.url)).toBe(`${BASE}/upload/v${version}/${publicId}.png`)
    expect(body).not.toHaveProperty('cloudinaryUrl')
    expect(body).not.toHaveProperty('originalUrl')
  })

  it('leaves the stored URLs out of a Local API read that overrides access', async () => {
    const legacy = await harness.payload.db.create({
      collection: 'media',
      data: legacyRow('legacy/local', 1600000001),
    })
    const req = await createLocalReq({}, harness.payload)

    const doc = await harness.payload.findByID({
      collection: 'media',
      id: legacy.id,
      req,
      overrideAccess: true,
    })

    expect(doc).not.toHaveProperty('cloudinaryUrl')
    expect(doc).not.toHaveProperty('originalUrl')
  })

  it('gives a public file a fresh originalUrl on a collection without privateFiles', async () => {
    const { doc, version } = await upload('public.png', {}, 'plain')

    const body = await read(doc.id, user, 'plain')

    expect(pathOf(body.originalUrl)).toBe(
      `${BASE}/upload/v${version}/${doc.cloudinaryPublicId}.png`,
    )
    expect(body).not.toHaveProperty('cloudinaryUrl')
  })
})
