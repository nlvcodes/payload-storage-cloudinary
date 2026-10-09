import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type CollectionConfig, type PayloadRequest } from 'payload'
import {
  getPremiumImageURL,
  getPrivateImageURL,
  getPublicPreviewURL,
  getServerImageURL,
  getSignedURLs,
} from '../../index'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]

// createUser numbers its users from 1, so the first user created is the admin.
const ADMIN_EMAIL = 'user-1@example.com'
const isAdmin = (req: { user?: { email?: string } | null }) => req.user?.email === ADMIN_EMAIL

const PREVIEW = {
  default: { quality: 'auto' },
  publicTransformation: { enabled: true, watermark: { defaultText: 'PREVIEW' } },
}

const collections: CollectionConfig[] = [
  // Payload's default read: any logged-in user, nobody else.
  { slug: 'media', upload: true, fields: [] },
  // Anyone reads, and the collection shows a preview with no customAuthCheck.
  { slug: 'previews', upload: true, access: { read: () => true }, fields: [] },
  // Anyone reads, the preview is on, and customAuthCheck gives the original to the admin only.
  { slug: 'premium', upload: true, access: { read: () => true }, fields: [] },
]

type User = NonNullable<PayloadRequest['user']>

describe('server helpers enforce access by default', () => {
  let harness: PayloadHarness
  let admin: TestUser
  let member: TestUser
  let adminUser: User
  let memberUser: User

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections: {
        media: { privateFiles: true },
        previews: { privateFiles: true, transformations: PREVIEW },
        premium: {
          privateFiles: { enabled: true, customAuthCheck: (req) => isAdmin(req) },
          transformations: PREVIEW,
        },
      },
    })
    admin = await harness.createUser()
    member = await harness.createUser()
    expect(admin.email).toBe(ADMIN_EMAIL)
    adminUser = await harness.userOf(admin)
    memberUser = await harness.userOf(member)
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const uploadPrivate = async (
    filename: string,
    collection = 'media',
    { withPreview = true }: { withPreview?: boolean } = {},
  ) => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename, withPreview ? { hasPublicTransformation: true } : {}),
      user: member,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    return doc
  }

  const signedOriginal = (doc: { cloudinaryPublicId: string; cloudinaryVersion: number }) =>
    new RegExp(
      `^${BASE}/authenticated/s--[\\w-]{8}--/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
    )

  describe('with no user, no req and no opt-in', () => {
    it('getPrivateImageURL returns no URL for a restricted document', async () => {
      const doc = await uploadPrivate('anon-private.png')

      const url = await getPrivateImageURL(doc, { payload: harness.payload, collection: 'media' })

      expect(url).toBeNull()
    })

    it('getServerImageURL returns no URL for a restricted document', async () => {
      const doc = await uploadPrivate('anon-server.png')

      const url = await getServerImageURL(doc, { payload: harness.payload, collection: 'media' })

      expect(url).toBeNull()
    })
  })

  describe('with a permitted reader', () => {
    it('getPrivateImageURL returns a signed authenticated URL for a permitted user', async () => {
      const doc = await uploadPrivate('user-private.png')

      const url = await getPrivateImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        user: memberUser,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })

    it('getPrivateImageURL returns a signed authenticated URL for a permitted req', async () => {
      const doc = await uploadPrivate('req-private.png')
      const req = await createLocalReq({ user: memberUser }, harness.payload)

      const url = await getPrivateImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        req,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })

    it('getServerImageURL returns a signed authenticated URL for a permitted user', async () => {
      const doc = await uploadPrivate('user-server.png')

      const url = await getServerImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        user: memberUser,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })

    it('getServerImageURL returns a signed authenticated URL for a permitted req', async () => {
      const doc = await uploadPrivate('req-server.png')
      const req = await createLocalReq({ user: memberUser }, harness.payload)

      const url = await getServerImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        req,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })
  })

  describe('getSignedURLs', () => {
    it('maps every ID to null with no user and no req', async () => {
      const first = await uploadPrivate('batch-anon-1.png')
      const second = await uploadPrivate('batch-anon-2.png')

      const urls = await getSignedURLs({
        payload: harness.payload,
        collection: 'media',
        docIds: [first.id, second.id],
      })

      expect(urls).toEqual({ [String(first.id)]: null, [String(second.id)]: null })
    })

    it('maps every ID to a signed authenticated URL for a permitted req', async () => {
      const first = await uploadPrivate('batch-req-1.png')
      const second = await uploadPrivate('batch-req-2.png')
      const req = await createLocalReq({ user: memberUser }, harness.payload)

      const urls = await getSignedURLs({
        payload: harness.payload,
        collection: 'media',
        docIds: [first.id, second.id],
        req,
      })

      expect(pathOf(urls[String(first.id)]!)).toMatch(signedOriginal(first))
      expect(pathOf(urls[String(second.id)]!)).toMatch(signedOriginal(second))
    })

    it('maps a readable ID to a URL and an unreadable one to null in the same batch', async () => {
      const doc = await uploadPrivate('batch-mixed.png')
      const req = await createLocalReq({ user: memberUser }, harness.payload)

      const urls = await getSignedURLs({
        payload: harness.payload,
        collection: 'media',
        docIds: [doc.id, '999999'],
        req,
      })

      expect(pathOf(urls[String(doc.id)]!)).toMatch(signedOriginal(doc))
      expect(urls['999999']).toBeNull()
    })
  })

  describe('with the explicit overrideAccess opt-in', () => {
    it('getPrivateImageURL returns a signed authenticated URL with no user', async () => {
      const doc = await uploadPrivate('trusted-private.png')

      const url = await getPrivateImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        overrideAccess: true,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })

    it('getServerImageURL returns a signed authenticated URL with no user', async () => {
      const doc = await uploadPrivate('trusted-server.png')

      const url = await getServerImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        overrideAccess: true,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })
  })

  describe('the access rule, read from the collection config', () => {
    it('refuses the original on a publicTransformation collection with no customAuthCheck', async () => {
      const doc = await uploadPrivate('previews.png', 'previews')

      for (const user of [undefined, memberUser, adminUser]) {
        const options = { payload: harness.payload, collection: 'previews', user }
        expect(await getPrivateImageURL(doc, options)).toBeNull()
        expect(await getServerImageURL(doc, options)).toBeNull()
      }
    })

    it('gives the original only to a reader whom customAuthCheck allows', async () => {
      const doc = await uploadPrivate('premium.png', 'premium')
      const memberReq = await createLocalReq({ user: memberUser }, harness.payload)
      const adminReq = await createLocalReq({ user: adminUser }, harness.payload)

      const options = { payload: harness.payload, collection: 'premium' }
      expect(await getPrivateImageURL(doc, { ...options, req: memberReq })).toBeNull()
      expect(pathOf((await getPrivateImageURL(doc, { ...options, req: adminReq }))!)).toMatch(
        signedOriginal(doc),
      )
    })

    it('signs the collection transformations into the original with includeTransformations', async () => {
      const doc = await uploadPrivate('premium-transformed.png', 'premium')

      const url = await getPrivateImageURL(doc, {
        payload: harness.payload,
        collection: 'premium',
        user: adminUser,
        includeTransformations: true,
      })

      expect(pathOf(url!)).toMatch(
        new RegExp(
          `^${BASE}/authenticated/s--[\\w-]{8}--/q_auto/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
        ),
      )
    })

    it('gives a trusted server job the original with the opt-in', async () => {
      const doc = await uploadPrivate('previews-trusted.png', 'previews')

      const url = await getServerImageURL(doc, {
        payload: harness.payload,
        collection: 'previews',
        overrideAccess: true,
      })

      expect(pathOf(url!)).toMatch(signedOriginal(doc))
    })
  })

  describe('no fallback to a stored URL or to the thumbnail', () => {
    it('getServerImageURL returns no URL for a private document with no Payload to check access', async () => {
      const doc = await uploadPrivate('no-payload.png')
      expect(doc.url).toEqual(expect.any(String))

      expect(await getServerImageURL(doc)).toBeNull()
    })

    it('getServerImageURL builds a public URL from the stored asset, not from the stored URL', async () => {
      const doc = {
        cloudinaryPublicId: 'folder/public-asset',
        cloudinaryVersion: 1700000000,
        cloudinaryFormat: 'png',
        cloudinaryType: 'upload',
        url: 'https://example.com/stale.png',
        cloudinaryUrl: 'https://example.com/stale.png',
      }

      const url = await getServerImageURL(doc, { transformations: { width: 100 } })

      expect(pathOf(url!)).toBe(`${BASE}/upload/w_100/v1700000000/folder/public-asset.png`)
    })

    it('getPublicPreviewURL never returns the thumbnail', () => {
      const doc = { thumbnailURL: `${BASE}/upload/c_fill,h_150,w_150/v1/asset.png` }

      expect(getPublicPreviewURL(doc)).toBeNull()
      expect(getPublicPreviewURL(doc, true)).toBeNull()
    })

    it('getPremiumImageURL gives a preview reader the preview from their own read, never the original', async () => {
      const doc = await uploadPrivate('premium-preview.png', 'premium')
      const asMember = await harness.request(`/api/premium/${doc.id}`, { user: member })
      const { previewUrl } = await asMember.json()

      const result = await getPremiumImageURL(doc, {
        payload: harness.payload,
        collection: 'premium',
        user: memberUser,
        isAuthenticated: true,
      })

      expect(result).toEqual({ url: previewUrl, isPreview: true, requiresAuth: true })
      // The watermark layer, on the signed authenticated asset.
      expect(pathOf(result.url!)).toMatch(
        new RegExp(
          `^${BASE}/authenticated/s--[\\w-]{8}--/.*l_text.+/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
        ),
      )
    })

    it('getPremiumImageURL gives the original to a reader whom the access rule allows', async () => {
      const doc = await uploadPrivate('premium-original.png', 'premium')

      const result = await getPremiumImageURL(doc, {
        payload: harness.payload,
        collection: 'premium',
        user: adminUser,
        isAuthenticated: true,
      })

      expect(pathOf(result.url!)).toMatch(signedOriginal(doc))
      expect(result).toMatchObject({ isPreview: false, requiresAuth: true })
    })

    it('getPremiumImageURL returns no URL to a reader the access rule gives nothing, even with a stored preview', async () => {
      const doc = await uploadPrivate('premium-none.png', 'premium', { withPreview: false })
      // A preview stored by 1.2.x, written without hooks
      const req = await createLocalReq({}, harness.payload)
      await harness.payload.db.updateOne({
        collection: 'premium',
        id: doc.id,
        data: {
          previewUrl: `${BASE}/upload/l_text:Arial_60:PREVIEW/v1/${doc.cloudinaryPublicId}.png`,
        },
        req,
      })

      const result = await getPremiumImageURL(doc, {
        payload: harness.payload,
        collection: 'premium',
        user: memberUser,
        isAuthenticated: true,
      })

      expect(result).toEqual({ url: null, isPreview: false, requiresAuth: true })
    })

    it('getPremiumImageURL returns no URL to a caller who cannot read the document', async () => {
      const doc = await uploadPrivate('premium-restricted.png')

      const result = await getPremiumImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        isAuthenticated: true,
      })

      expect(result.url).toBeNull()
    })
  })
})
