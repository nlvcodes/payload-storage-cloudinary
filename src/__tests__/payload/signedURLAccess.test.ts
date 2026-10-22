import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// createUser numbers its users from 1, so the first user created is the admin.
const ADMIN_EMAIL = 'user-1@example.com'
const isAdmin = (req: { user?: { email?: string } | null }) => req.user?.email === ADMIN_EMAIL

const PREVIEW = {
  default: { quality: 'auto' },
  publicTransformation: { enabled: true, watermark: { defaultText: 'PREVIEW' } },
}

const collections: CollectionConfig[] = [
  // A query-based read: each user reads only the files they own.
  {
    slug: 'media',
    upload: true,
    access: { read: ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false) },
    fields: [{ name: 'owner', type: 'relationship', relationTo: 'users' }],
  },
  // A boolean read: only the admin reads.
  {
    slug: 'vault',
    upload: true,
    access: { read: ({ req }) => isAdmin(req) },
    fields: [],
  },
  // Default read (any logged-in user), with a customAuthCheck and preset selection.
  {
    slug: 'gated',
    upload: true,
    fields: [{ name: 'alt', type: 'text' }],
  },
  // Anyone reads, and the collection shows a preview with no customAuthCheck.
  {
    slug: 'previews',
    upload: true,
    access: { read: () => true },
    fields: [],
  },
  // Anyone reads, the preview is on, and customAuthCheck gives the original to the admin only.
  {
    slug: 'premium',
    upload: true,
    access: { read: () => true },
    fields: [],
  },
  // Anyone reads, and the preview is on in the documented shape, with no `default` key.
  {
    slug: 'documented',
    upload: true,
    access: { read: () => true },
    fields: [],
  },
]

describe('signed-URL endpoints and the preset read path enforce access', () => {
  let harness: PayloadHarness
  let admin: TestUser
  let member: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections: {
        media: { privateFiles: true },
        vault: { privateFiles: true },
        gated: {
          privateFiles: { enabled: true, customAuthCheck: (_req, doc) => doc.alt === 'open' },
          transformations: {
            default: { quality: 'auto' },
            presets: [{ name: 'card', label: 'Card', transformations: { width: 400 } }],
            enablePresetSelection: true,
            preserveOriginal: true,
          },
        },
        previews: { privateFiles: true, transformations: PREVIEW },
        premium: {
          privateFiles: { enabled: true, customAuthCheck: (req) => isAdmin(req) },
          transformations: PREVIEW,
        },
        documented: {
          privateFiles: true,
          transformations: { preserveOriginal: true, publicTransformation: { enabled: true } },
        },
      },
    })
    admin = await harness.createUser()
    member = await harness.createUser()
    expect(admin.email).toBe(ADMIN_EMAIL)
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (collection: string, user: TestUser, data: Record<string, unknown> = {}) => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(`${collection}.png`, data),
      user,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc as { id: number }
  }

  const signedURL = (collection: string, id: unknown, user?: TestUser, query = '') =>
    harness.request(`/api/${collection}/signed-url/${id}${query}`, { user })

  const batch = (collection: string, ids: unknown[], user?: TestUser) =>
    harness.request(`/api/${collection}/signed-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.map(String) }),
      user,
    })

  describe('single endpoint', () => {
    it('refuses an anonymous request for a restricted document with 403 and no URL', async () => {
      const doc = await upload('media', admin, { owner: admin.id })

      const res = await signedURL('media', doc.id)

      expect(res.status).toBe(403)
      expect((await res.json()).url).toBeUndefined()
    })

    it('returns no URLs to an anonymous caller walking IDs 1..n', async () => {
      for (let i = 0; i < 3; i++) await upload('media', admin, { owner: admin.id })
      // Counts rows as a trusted test fixture, so it skips access on purpose and needs no `req`.
      const { totalDocs } = await harness.payload.find({
        collection: 'media',
        limit: 0,
        overrideAccess: true,
      })

      for (let id = 1; id <= totalDocs + 2; id++) {
        const res = await signedURL('media', id)
        expect(res.status).toBe(403)
        expect((await res.json()).url).toBeUndefined()
      }
    })

    it('refuses a logged-in user without read access with 403', async () => {
      const doc = await upload('vault', admin)

      const res = await signedURL('vault', doc.id, member)

      expect(res.status).toBe(403)
      expect((await res.json()).url).toBeUndefined()
    })

    it('answers 404 for a document outside a query-based read', async () => {
      const doc = await upload('media', admin, { owner: admin.id })

      const res = await signedURL('media', doc.id, member)

      expect(res.status).toBe(404)
      expect((await res.json()).url).toBeUndefined()
    })

    it('gives a URL to a reader the access rule allows the original', async () => {
      const doc = await upload('media', member, { owner: member.id })

      const res = await signedURL('media', doc.id, member)

      expect(res.status).toBe(200)
      expect((await res.json()).url).toEqual(expect.any(String))
    })

    it('refuses a reader whom customAuthCheck denies', async () => {
      const closed = await upload('gated', admin, { alt: 'closed' })
      const open = await upload('gated', admin, { alt: 'open' })

      const closedRes = await signedURL('gated', closed.id, member)
      expect(closedRes.status).toBe(403)
      expect((await closedRes.json()).url).toBeUndefined()

      const openRes = await signedURL('gated', open.id, member)
      expect(openRes.status).toBe(200)
    })

    it('refuses the original on a publicTransformation collection with no customAuthCheck', async () => {
      const doc = await upload('previews', admin, { hasPublicTransformation: true })

      for (const user of [undefined, member, admin]) {
        const res = await signedURL('previews', doc.id, user)
        expect(res.status).toBe(403)
        expect((await res.json()).url).toBeUndefined()
      }
    })

    it('refuses the original on the documented preview shape with no default key', async () => {
      const doc = await upload('documented', admin, { hasPublicTransformation: true })

      const res = await signedURL('documented', doc.id, member)

      expect(res.status).toBe(403)
      expect((await res.json()).url).toBeUndefined()
    })

    it('refuses a preview reader who sends transformations', async () => {
      const doc = await upload('premium', admin, { hasPublicTransformation: true })
      const query = `?transformations=${encodeURIComponent(JSON.stringify({ width: 2000 }))}`

      const previewRes = await signedURL('premium', doc.id, member, query)
      expect(previewRes.status).toBe(403)
      expect((await previewRes.json()).url).toBeUndefined()

      const originalRes = await signedURL('premium', doc.id, admin, query)
      expect(originalRes.status).toBe(200)
      expect((await originalRes.json()).url).toEqual(expect.any(String))
    })
  })

  describe('batch endpoint', () => {
    it('returns a URL only for readable IDs, and a status for each other ID', async () => {
      const own = await upload('media', member, { owner: member.id })
      const other = await upload('media', admin, { owner: admin.id })
      const missing = 99_999

      const res = await batch('media', [own.id, other.id, missing], member)

      expect(res.status).toBe(200)
      const { results } = await res.json()
      expect(results).toHaveLength(3)
      expect(results[0]).toMatchObject({ id: String(own.id), url: expect.any(String) })
      expect(results[1]).toEqual({ id: String(other.id), status: 404, error: 'Document not found' })
      expect(results[2]).toEqual({ id: String(missing), status: 404, error: 'Document not found' })
    })

    it('returns no URLs to an anonymous caller asking for IDs 1..n', async () => {
      // Counts rows as a trusted test fixture, so it skips access on purpose and needs no `req`.
      const { totalDocs } = await harness.payload.find({
        collection: 'media',
        limit: 0,
        overrideAccess: true,
      })
      const ids = Array.from({ length: totalDocs + 2 }, (_, i) => i + 1)

      const res = await batch('media', ids)

      expect(res.status).toBe(200)
      const { results } = await res.json()
      expect(results).toHaveLength(ids.length)
      for (const result of results) {
        expect(result.url).toBeUndefined()
        expect(result.status).toBe(403)
      }
    })

    it('gives 403 for each ID when the caller has no read access', async () => {
      const doc = await upload('vault', admin)

      const res = await batch('vault', [doc.id], member)

      const { results } = await res.json()
      expect(results).toEqual([{ id: String(doc.id), status: 403, error: 'Access denied' }])
    })

    it('gives 403 for an ID that customAuthCheck denies', async () => {
      const closed = await upload('gated', admin, { alt: 'closed' })
      const open = await upload('gated', admin, { alt: 'open' })

      const res = await batch('gated', [closed.id, open.id], member)

      const { results } = await res.json()
      expect(results[0]).toEqual({ id: String(closed.id), status: 403, error: 'Access denied' })
      expect(results[1]).toMatchObject({ id: String(open.id), url: expect.any(String) })
    })

    it('gives 403 to a preview reader, with or without transformations', async () => {
      const doc = await upload('premium', admin, { hasPublicTransformation: true })

      const res = await harness.request('/api/premium/signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [String(doc.id)], transformations: { width: 2000 } }),
        user: member,
      })

      const { results } = await res.json()
      expect(results).toEqual([{ id: String(doc.id), status: 403, error: 'Access denied' }])
    })
  })

  describe('preset read path', () => {
    it('nulls transformedUrl when customAuthCheck denies', async () => {
      const closed = await upload('gated', admin, { alt: 'closed', transformationPreset: ['card'] })
      const open = await upload('gated', admin, { alt: 'open', transformationPreset: ['card'] })

      const closedRead = await (await harness.request(`/api/gated/${closed.id}`, { user: member })).json()
      expect(closedRead.transformedUrl).toBeNull()

      const openRead = await (await harness.request(`/api/gated/${open.id}`, { user: member })).json()
      expect(openRead.transformedUrl).toEqual(expect.any(String))
    })
  })
})
