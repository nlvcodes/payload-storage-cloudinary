import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

// Anyone reads the document, as on a site that shows every visitor the preview.
const readable = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  access: { read: () => true },
  fields: [],
})

// The basic configuration from docs/public-transformation-example.md: no `default` key and no
// customAuthCheck, so nobody gets the original.
const documentedTransformations = {
  preserveOriginal: true,
  publicTransformation: {
    enabled: true,
    watermark: {
      defaultText: 'PREVIEW',
      style: { fontFamily: 'Arial', fontSize: 50, color: 'rgb:808080', opacity: 50, angle: -45 },
    },
    blur: { effect: 'blur:2000', quality: 30 },
  },
}

const thumbPreset = {
  name: 'thumb',
  label: 'Thumb',
  transformations: { width: 300, crop: 'scale' },
}

const pluginCollections = {
  gallery: { privateFiles: true, transformations: documentedTransformations },
  // customAuthCheck gives the original to logged-in readers only
  members: {
    privateFiles: { enabled: true, customAuthCheck: (req: any) => Boolean(req.user) },
    transformations: {
      ...documentedTransformations,
      enablePresetSelection: true,
      presets: [thumbPreset],
    },
  },
  // The preview turned on with no watermark settings at all
  bare: {
    privateFiles: true,
    transformations: {
      preserveOriginal: true,
      enablePresetSelection: true,
      presets: [thumbPreset],
      publicTransformation: { enabled: true },
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

// An unsigned upload URL. `transformation` is a regex fragment ending in `/`, or empty.
const uploadURL = (publicId: string, version: number, transformation = '') =>
  new RegExp(`^${BASE}/upload/${transformation}v${version}/${escape(publicId)}\\.png$`)

// Every Cloudinary URL in a response body, by field.
const cloudinaryURLs = (body: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(body).filter(
      ([, value]) => typeof value === 'string' && value.includes('res.cloudinary.com'),
    ),
  )

describe('a publicTransformation collection gives preview readers a signed preview only', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [readable('gallery'), readable('members'), readable('bare')],
      pluginCollections,
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const read = async (collection: string, id: string | number, asUser?: TestUser) => {
    const res = await harness.request(`/api/${collection}/${id}`, { user: asUser })
    expect(res.status).toBe(200)
    return res.json()
  }

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

  it('uploads no public copy, on upload or when the preview settings change', async () => {
    const before = harness.cloudinary.calls.length
    const { doc } = await upload('gallery', 'no-copy.png', { hasPublicTransformation: true })
    await update('gallery', doc.id, { transformationType: 'blur' })
    await update('gallery', doc.id, { hasPublicTransformation: false })

    const calls = harness.cloudinary.calls.slice(before)
    // The original's own upload, and nothing else: no copy, no destroy of an old copy.
    expect(calls.map((c) => c.method)).toEqual(['upload_stream'])
  })

  it('gives an anonymous reader of a 1.2.x record the preview only', async () => {
    const publicId = 'legacy/preview'
    const version = 1600000000
    // A row from 1.2.x: a public upload asset with no stored type, and a stored public preview
    // URL. Seeding it is a trusted server job, so it writes the row directly.
    const legacy = await harness.payload.db.create({
      collection: 'gallery',
      data: {
        filename: 'preview.png',
        mimeType: 'image/png',
        cloudinaryPublicId: publicId,
        cloudinaryVersion: version,
        cloudinaryResourceType: 'image',
        cloudinaryFormat: 'png',
        originalUrl: `${BASE}/upload/v${version}/${publicId}.png`,
        cloudinaryUrl: `${BASE}/upload/v${version}/${publicId}.png`,
        isPrivate: true,
        requiresSignedURL: true,
        hasPublicTransformation: true,
        publicTransformationUrl: `${BASE}/upload/l_text:Arial_50:PREVIEW/v${version}/${publicId}.png`,
      },
    })

    const body = await read('gallery', legacy.id)

    expect(Object.keys(cloudinaryURLs(body))).toEqual(['previewUrl'])
    // Still an upload asset, so its preview stays unsigned until it is migrated
    expect(pathOf(body.previewUrl)).toMatch(uploadURL(publicId, version, '.*l_text.+/'))
    for (const field of ['url', 'thumbnailURL', 'transformedUrl', 'publicTransformationUrl']) {
      expect(body[field] ?? null, field).toBeNull()
    }
    expect(body).not.toHaveProperty('originalUrl')
    expect(body).not.toHaveProperty('cloudinaryUrl')
  })

  it('watermarks the preview with the default text when the config sets no watermark', async () => {
    const { doc, version } = await upload('bare', 'bare.png', {
      hasPublicTransformation: true,
      transformationPreset: ['thumb'],
    })

    const body = await read('bare', doc.id)

    expect(Object.keys(cloudinaryURLs(body))).toEqual(['previewUrl'])
    expect(pathOf(body.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/.*l_text:[^/]*WATERMARK.+/'),
    )
  })

  it('gives an anonymous reader a signed, watermarked preview and no other URL', async () => {
    const { doc, version } = await upload('gallery', 'watermark.png', {
      hasPublicTransformation: true,
      watermarkText: 'SAMPLE',
    })

    const body = await read('gallery', doc.id)

    expect(Object.keys(cloudinaryURLs(body))).toEqual(['previewUrl'])
    expect(pathOf(body.previewUrl)).toMatch(
      signedURL(
        doc.cloudinaryPublicId,
        version,
        '.*l_text:Arial_50_bold_letter_spacing_15:SAMPLE.+/',
      ),
    )
  })

  it('gives an anonymous reader a signed, blurred preview and no other URL', async () => {
    const { doc, version } = await upload('gallery', 'blur.png', {
      hasPublicTransformation: true,
      transformationType: 'blur',
    })

    const body = await read('gallery', doc.id)

    expect(Object.keys(cloudinaryURLs(body))).toEqual(['previewUrl'])
    expect(pathOf(body.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_limit,e_blur:2000,h_600,q_30,w_600/'),
    )
  })

  it('gives a reader with the original the original URLs and the preview', async () => {
    const { doc, version } = await upload('members', 'member.png', {
      hasPublicTransformation: true,
      transformationPreset: ['thumb'],
    })

    const member = await read('members', doc.id, user)
    const visitor = await read('members', doc.id)

    expect(pathOf(member.url)).toMatch(signedURL(doc.cloudinaryPublicId, version))
    expect(pathOf(member.thumbnailURL)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_fill,f_auto,g_auto,h_150,q_auto,w_150/'),
    )
    expect(pathOf(member.transformedUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/'),
    )
    expect(pathOf(member.previewUrl)).toMatch(
      signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/.*l_text:[^/]*PREVIEW.+/'),
    )
    // The same document gives a visitor the same preview and nothing else
    expect(Object.keys(cloudinaryURLs(visitor))).toEqual(['previewUrl'])
    expect(visitor.previewUrl).toBe(member.previewUrl)
  })
})
