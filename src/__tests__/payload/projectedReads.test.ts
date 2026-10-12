import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPayloadRequest, type CollectionConfig } from 'payload'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

// Anyone reads the documents and their versions, so only the plugin's access rule decides which
// URLs a reader gets.
const lockable = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  versions: true,
  access: { read: () => true, readVersions: () => true },
  fields: [{ name: 'locked', type: 'checkbox' }],
})

const posts: CollectionConfig = {
  slug: 'posts',
  access: { read: () => true },
  fields: [
    { name: 'premium', type: 'upload', relationTo: 'premium' },
    { name: 'denied', type: 'upload', relationTo: 'denied' },
  ],
}

const collections = [
  lockable('premium'),
  lockable('denied'),
  lockable('previews'),
  { ...lockable('drafts'), versions: { drafts: true } },
  posts,
]

// The pattern the signed URLs guide documents: a field of the document decides, and a
// logged-in reader always gets the original.
const lockedCheck = (req: any, doc: any) => doc.locked !== true || Boolean(req.user)

const presets = {
  default: {},
  preserveOriginal: true,
  enablePresetSelection: true,
  presets: [{ name: 'thumb', label: 'Thumb', transformations: { width: 300, crop: 'scale' } }],
}

const pluginCollections = {
  premium: {
    privateFiles: { enabled: true, customAuthCheck: lockedCheck },
    transformations: presets,
  },
  drafts: { privateFiles: { enabled: true, customAuthCheck: lockedCheck } },
  // Nobody gets the original, not even a logged-in reader.
  denied: {
    privateFiles: { enabled: true, customAuthCheck: () => false },
    transformations: presets,
  },
  previews: {
    privateFiles: { enabled: true, customAuthCheck: lockedCheck },
    transformations: {
      ...presets,
      publicTransformation: { enabled: true, watermark: { defaultText: 'Preview' } },
    },
  },
}

const URL_FIELDS = ['url', 'thumbnailURL', 'transformedUrl', 'previewUrl'] as const

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A signed authenticated URL. `transformation` is a regex fragment ending in `/`, or empty.
const signedURL = (publicId: string, version: number, transformation = '') =>
  new RegExp(
    `^${BASE}/authenticated/s--[\\w-]{8}--/${transformation}v${version}/${escape(publicId)}\\.png$`,
  )

// A private row whose delivery URLs were stored, as a folder move or an older version left them.
const storedRow = (publicId: string) => {
  const signed = `${BASE}/authenticated/s--abcdefgh--/v1600000000/${publicId}.png`
  return {
    filename: `${publicId.split('/').pop()}.png`,
    mimeType: 'image/png',
    cloudinaryPublicId: publicId,
    cloudinaryVersion: 1600000000,
    cloudinaryResourceType: 'image',
    cloudinaryFormat: 'png',
    cloudinaryType: 'authenticated',
    isPrivate: true,
    requiresSignedURL: true,
    url: signed,
    thumbnailURL: signed,
    transformedUrl: signed,
  }
}

// No delivery URL of the asset anywhere in the response, under any field name.
const expectNoDeliveryURL = (body: unknown) => {
  expect(JSON.stringify(body)).not.toContain('res.cloudinary.com')
}

const expectNoURLFields = (doc: Record<string, unknown>) => {
  for (const field of URL_FIELDS) {
    expect(doc[field] ?? null, field).toBeNull()
  }
  expectNoDeliveryURL(doc)
}

describe('reads apply the access rule to every projection', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({ collections, pluginCollections })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (collection: string, filename: string, data: Record<string, unknown>) => {
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

  const get = async (path: string, asUser?: TestUser) => {
    const res = await harness.request(path, { user: asUser })
    expect(res.status, path).toBe(200)
    return res.json()
  }

  // A private row with stored delivery URLs, and a version row with the same data. Seeding them is
  // a trusted server job, so it writes through the database adapter.
  const seedStored = async (collection: string, publicId: string) => {
    const req = await createPayloadRequest({ payload: harness.payload })
    const data = storedRow(publicId)
    const doc = await harness.payload.db.create({ collection, data, req })
    const now = new Date().toISOString()
    const version = await harness.payload.db.createVersion({
      collectionSlug: collection,
      parent: doc.id,
      versionData: { ...data, createdAt: now, updatedAt: now },
      autosave: false,
      createdAt: now,
      updatedAt: now,
      req,
    })
    return { id: doc.id, versionID: version.id }
  }

  const ASSET_ONLY =
    'select[cloudinaryPublicId]=true&select[cloudinaryType]=true&select[url]=true' +
    '&select[thumbnailURL]=true&select[transformedUrl]=true&select[previewUrl]=true'

  it('decides on the whole document when the read leaves out the field the check reads', async () => {
    const { doc } = await upload('premium', 'locked.png', {
      locked: true,
      transformationPreset: ['thumb'],
    })

    for (const query of [ASSET_ONLY, 'select[locked]=false']) {
      const body = await get(`/api/premium/${doc.id}?${query}`)

      expect(body.locked, query).toBeUndefined()
      expectNoURLFields(body)
    }
  })

  it('returns no stored URL from a read that selects only a URL field', async () => {
    const { id } = await seedStored('denied', 'denied/stored')

    for (const query of ['select[url]=true', 'select[thumbnailURL]=true']) {
      for (const reader of [undefined, user]) {
        const body = await get(`/api/denied/${id}?${query}`, reader)

        expect(body.url ?? null, query).toBeNull()
        expect(body.thumbnailURL ?? null, query).toBeNull()
        expectNoDeliveryURL(body)
      }
    }
  })

  it('applies the rule to a populated document', async () => {
    const { doc: locked } = await upload('premium', 'populated.png', {
      locked: true,
      transformationPreset: ['thumb'],
    })
    const { id: deniedID } = await seedStored('denied', 'denied/populated')
    // Seeding is a trusted server job, so it skips access on purpose.
    const post = await harness.payload.create({
      collection: 'posts',
      data: { premium: locked.id, denied: deniedID },
      req: await createPayloadRequest({ payload: harness.payload }),
      overrideAccess: true,
    })

    const premiumOnly = await get(
      `/api/posts/${post.id}?populate[premium][cloudinaryPublicId]=true` +
        '&populate[premium][cloudinaryType]=true&populate[premium][url]=true' +
        '&populate[premium][thumbnailURL]=true&populate[premium][transformedUrl]=true',
    )
    expect(premiumOnly.premium.id).toBe(locked.id)
    expectNoURLFields(premiumOnly.premium)

    const deniedOnly = await get(`/api/posts/${post.id}?populate[denied][url]=true`)
    expect(deniedOnly.denied.id).toBe(deniedID)
    expectNoURLFields(deniedOnly.denied)
  })

  it('applies the rule to a projected versions list and version by ID', async () => {
    const { doc: locked } = await upload('premium', 'versioned.png', {
      locked: true,
      transformationPreset: ['thumb'],
    })
    const { id: deniedID, versionID: deniedVersionID } = await seedStored(
      'denied',
      'denied/versioned',
    )

    const premiumList = await get(
      `/api/premium/versions?where[parent][equals]=${locked.id}` +
        '&select[version][cloudinaryPublicId]=true&select[version][cloudinaryType]=true' +
        '&select[version][url]=true&select[version][thumbnailURL]=true',
    )
    expect(premiumList.docs.length).toBeGreaterThan(0)
    for (const version of premiumList.docs) expectNoURLFields(version.version)

    const premiumVersion = await get(
      `/api/premium/versions/${premiumList.docs[0].id}?select[version][locked]=false`,
    )
    expect(premiumVersion.version.cloudinaryPublicId).toBe(locked.cloudinaryPublicId)
    expectNoURLFields(premiumVersion.version)

    const deniedList = await get(
      `/api/denied/versions?where[parent][equals]=${deniedID}&select[version][url]=true`,
    )
    expect(deniedList.docs.length).toBe(1)
    expectNoURLFields(deniedList.docs[0].version)

    const deniedVersion = await get(
      `/api/denied/versions/${deniedVersionID}?select[version][url]=true`,
    )
    expectNoURLFields(deniedVersion.version)
  })

  it('still gives a reader the rule allows a signed url on a projected read', async () => {
    const { doc, version } = await upload('premium', 'allowed.png', {
      locked: true,
      transformationPreset: ['thumb'],
    })

    for (const query of ['select[filename]=true', 'select[url]=true', 'select[locked]=false']) {
      const body = await get(`/api/premium/${doc.id}?${query}`, user)

      expect(pathOf(body.url), query).toMatch(signedURL(doc.cloudinaryPublicId, version))
      expect(pathOf(body.thumbnailURL), query).toMatch(
        signedURL(doc.cloudinaryPublicId, version, 'c_fill,f_auto,g_auto,h_150,q_auto,w_150/'),
      )
      expect(pathOf(body.transformedUrl), query).toMatch(
        signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/'),
      )
    }

    const list = await get(
      `/api/premium/versions?where[parent][equals]=${doc.id}&select[version][url]=true`,
      user,
    )
    const byID = await get(
      `/api/premium/versions/${list.docs[0].id}?select[version][url]=true`,
      user,
    )
    expect(pathOf(byID.version.url)).toMatch(signedURL(doc.cloudinaryPublicId, version))
  })

  it('gives a preview-only reader only the preview on a projected read', async () => {
    const { doc, version } = await upload('previews', 'preview.png', {
      locked: true,
      hasPublicTransformation: true,
      transformationPreset: ['thumb'],
    })

    for (const query of ['select[filename]=true', 'select[previewUrl]=true', ASSET_ONLY]) {
      const body = await get(`/api/previews/${doc.id}?${query}`)

      expect(body.url ?? null, query).toBeNull()
      expect(body.thumbnailURL ?? null, query).toBeNull()
      expect(body.transformedUrl ?? null, query).toBeNull()
      // The preset, then the watermark layer, signed, so dropping either breaks the URL.
      expect(pathOf(body.previewUrl), query).toMatch(
        signedURL(doc.cloudinaryPublicId, version, 'c_scale,w_300/.*l_text.+/'),
      )
    }
  })

  it('decides a draft read on the stored document, so a draft cannot unlock the file', async () => {
    const { doc } = await upload('drafts', 'draft.png', { locked: true, _status: 'published' })
    const res = await harness.request(`/api/drafts/${doc.id}?draft=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: false }),
      user,
    })
    expect(res.status).toBe(200)

    for (const query of ['draft=true', 'draft=true&select[locked]=true']) {
      const body = await get(`/api/drafts/${doc.id}?${query}`)

      expect(body.locked, query).toBe(false)
      expectNoURLFields(body)
    }
  })

  it('gives no URL on a versions list when customAuthCheck has to decide', async () => {
    // The hook can't tell which stored version a list entry is, so it can't run the check on
    // the whole version. It fails closed, even for a reader the rule allows.
    const { doc } = await upload('premium', 'list.png', { transformationPreset: ['thumb'] })

    const list = await get(`/api/premium/versions?where[parent][equals]=${doc.id}`, user)

    expect(list.docs.length).toBeGreaterThan(0)
    for (const version of list.docs) expectNoURLFields(version.version)
  })
})
