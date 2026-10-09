import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createLocalReq, type CollectionConfig, type PayloadRequest } from 'payload'
import {
  getPremiumImageURL,
  getPrivateImageURL,
  getServerImageURL,
  getSignedURL,
  getSignedURLs,
} from '../../index'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]

// createUser numbers its users from 1, so the first user created is the admin.
const ADMIN_EMAIL = 'user-1@example.com'
const isAdmin = (req: { user?: { email?: string } | null }) => req.user?.email === ADMIN_EMAIL

// Every document customAuthCheck received, in order.
const seen: Record<string, any>[] = []

// Anyone reads the documents, but only the admin reads `locked`. The check reads `locked`, so a
// check that gets the document as a reader sees it would let every reader through.
const collections: CollectionConfig[] = [
  {
    slug: 'premium',
    upload: true,
    access: { read: () => true },
    fields: [
      { name: 'locked', type: 'checkbox', access: { read: ({ req }) => isAdmin(req) } },
      { name: 'owner', type: 'relationship', relationTo: 'users' },
    ],
  },
]

const pluginCollections = {
  premium: {
    privateFiles: {
      enabled: true,
      customAuthCheck: (req: any, doc: any) => {
        seen.push(doc)
        return doc.locked !== true || isAdmin(req)
      },
    },
  },
}

type User = NonNullable<PayloadRequest['user']>

describe('the endpoints and the server helpers decide on the stored document', () => {
  let harness: PayloadHarness
  let admin: TestUser
  let member: TestUser
  let adminUser: User
  let memberUser: User

  beforeAll(async () => {
    harness = await startPayload({ collections, pluginCollections })
    admin = await harness.createUser()
    member = await harness.createUser()
    expect(admin.email).toBe(ADMIN_EMAIL)
    adminUser = await harness.userOf(admin)
    memberUser = await harness.userOf(member)
  })

  afterAll(async () => {
    await harness?.stop()
  })

  beforeEach(() => {
    seen.length = 0
  })

  const upload = async (filename: string, data: Record<string, unknown>) => {
    const res = await harness.request('/api/premium', {
      method: 'POST',
      body: pngUpload(filename, { owner: admin.id, ...data }),
      user: admin,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()
    return doc as { id: number; cloudinaryPublicId: string; cloudinaryVersion: number }
  }

  const signedOriginal = (doc: { cloudinaryPublicId: string; cloudinaryVersion: number }) =>
    new RegExp(
      `^${BASE}/authenticated/s--[\\w-]{8}--/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
    )

  const single = (id: unknown, user?: TestUser) =>
    harness.request(`/api/premium/signed-url/${id}`, { user })

  const batch = (ids: unknown[], user?: TestUser) =>
    harness.request('/api/premium/signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.map(String) }),
      user,
    })

  describe('a check that reads a field the reader cannot read', () => {
    it('makes the single endpoint refuse a reader the check denies', async () => {
      const doc = await upload('single-locked.png', { locked: true })

      for (const reader of [undefined, member]) {
        const res = await single(doc.id, reader)

        expect(res.status, reader?.email ?? 'anonymous').toBe(403)
        expect(JSON.stringify(await res.json())).not.toContain('res.cloudinary.com')
      }
    })

    it('makes the batch endpoint refuse a reader the check denies', async () => {
      const locked = await upload('batch-locked.png', { locked: true })
      const open = await upload('batch-open.png', { locked: false })

      for (const reader of [undefined, member]) {
        const res = await batch([locked.id, open.id], reader)
        expect(res.status).toBe(200)
        const { results } = await res.json()

        expect(results[0]).toEqual({ id: String(locked.id), status: 403, error: 'Access denied' })
        expect(pathOf(results[1].url)).toMatch(signedOriginal(open))
      }
    })

    it('makes every server helper refuse a reader the check denies', async () => {
      const doc = await upload('helpers-locked.png', { locked: true })
      const payload = harness.payload
      const collection = 'premium'
      const memberReq = await createLocalReq({ user: memberUser }, payload)

      for (const access of [{}, { user: memberUser }, { req: memberReq }]) {
        expect(await getSignedURL({ payload, collection, docId: doc.id, ...access })).toBeNull()
        expect(await getSignedURLs({ payload, collection, docIds: [doc.id], ...access })).toEqual({
          [String(doc.id)]: null,
        })
        expect(await getServerImageURL(doc, { payload, collection, ...access })).toBeNull()
        expect(await getPrivateImageURL(doc, { payload, collection, ...access })).toBeNull()
        expect(
          await getPremiumImageURL(doc, { payload, collection, isAuthenticated: true, ...access }),
        ).toEqual({ url: null, isPreview: false, requiresAuth: true })
      }
    })
  })

  describe('a reader the check allows', () => {
    it('still gets a signed URL from both endpoints', async () => {
      const locked = await upload('allowed-locked.png', { locked: true })
      const open = await upload('allowed-open.png', { locked: false })

      for (const [reader, doc] of [
        [admin, locked],
        [member, open],
        [undefined, open],
      ] as const) {
        const res = await single(doc.id, reader)
        expect(res.status).toBe(200)
        expect(pathOf((await res.json()).url)).toMatch(signedOriginal(doc))
      }

      const res = await batch([locked.id, open.id], admin)
      const { results } = await res.json()
      expect(pathOf(results[0].url)).toMatch(signedOriginal(locked))
      expect(pathOf(results[1].url)).toMatch(signedOriginal(open))
    })

    it('still gets a signed URL from every server helper', async () => {
      const locked = await upload('helpers-allowed.png', { locked: true })
      const payload = harness.payload
      const collection = 'premium'
      const adminReq = await createLocalReq({ user: adminUser }, payload)

      for (const access of [{ user: adminUser }, { req: adminReq }]) {
        const original = signedOriginal(locked)
        const urls = await getSignedURLs({ payload, collection, docIds: [locked.id], ...access })
        const premium = await getPremiumImageURL(locked, {
          payload,
          collection,
          isAuthenticated: true,
          ...access,
        })

        expect(
          pathOf((await getSignedURL({ payload, collection, docId: locked.id, ...access }))!),
        ).toMatch(original)
        expect(pathOf(urls[String(locked.id)]!)).toMatch(original)
        expect(
          pathOf((await getServerImageURL(locked, { payload, collection, ...access }))!),
        ).toMatch(original)
        expect(
          pathOf((await getPrivateImageURL(locked, { payload, collection, ...access }))!),
        ).toMatch(original)
        expect(pathOf(premium.url!)).toMatch(original)
        expect(premium.isPreview).toBe(false)
      }
    })
  })

  it('gives customAuthCheck the same document from the endpoints, the helpers and a read', async () => {
    const doc = await upload('shape.png', { locked: true })
    seen.length = 0

    // The read path decides on the stored document, relationship fields as IDs
    const read = await harness.request(`/api/premium/${doc.id}?depth=1`, { user: member })
    expect(read.status).toBe(200)
    expect((await read.json()).owner.id).toBe(admin.id)
    expect(seen.length).toBeGreaterThan(0)
    const stored = seen[0]
    expect(stored.locked).toBe(true)
    expect(stored.owner).toBe(admin.id)

    const operations: Record<string, () => Promise<unknown>> = {
      single: () => single(doc.id, member),
      batch: () => batch([doc.id], member),
      getSignedURL: () =>
        getSignedURL({
          payload: harness.payload,
          collection: 'premium',
          docId: doc.id,
          user: memberUser,
        }),
      getPremiumImageURL: () =>
        getPremiumImageURL(doc, {
          payload: harness.payload,
          collection: 'premium',
          isAuthenticated: true,
          user: memberUser,
        }),
    }

    for (const [name, run] of Object.entries(operations)) {
      seen.length = 0
      await run()

      expect(seen.length, name).toBeGreaterThan(0)
      for (const received of seen) expect(received, name).toEqual(stored)
    }
  })
})
