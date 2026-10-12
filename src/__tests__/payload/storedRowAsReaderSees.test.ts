import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPayloadRequest, type CollectionConfig, type PayloadRequest } from 'payload'
import { getSignedURL } from '../../index'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]
const URL_FIELDS = ['url', 'thumbnailURL', 'transformedUrl', 'previewUrl'] as const

// createUser numbers its users from 1, so the first user created is the admin.
const ADMIN_EMAIL = 'user-1@example.com'
const isAdmin = (req: { user?: { email?: string } | null }) => req.user?.email === ADMIN_EMAIL

// Every document customAuthCheck received, in order.
const seen: Record<string, any>[] = []
// How often a collection afterRead hook of the site's own ran.
let siteHookRuns = 0
// Makes a field hook throw on the plugin's stored-document read, and only there.
let failStoredRead = false

const lockedField = { name: 'locked', type: 'checkbox', localized: true } as const

// Anyone reads the documents. Payload's default `readVersions` lets any logged-in user read the
// versions. Only the access rule decides which URLs a reader gets.
const collections: CollectionConfig[] = [
  {
    slug: 'localized',
    upload: true,
    access: { read: () => true },
    hooks: {
      afterRead: [
        ({ doc }) => {
          siteHookRuns += 1
          return doc
        },
      ],
    },
    fields: [
      lockedField,
      {
        name: 'probe',
        type: 'text',
        hooks: {
          afterRead: [
            ({ overrideAccess, value }) => {
              if (failStoredRead && overrideAccess) throw new Error('The stored read failed')
              return value
            },
          ],
        },
      },
    ],
  },
  {
    slug: 'versioned',
    upload: true,
    versions: true,
    access: { read: () => true },
    fields: [lockedField],
  },
  {
    slug: 'drafted',
    upload: true,
    versions: { drafts: true },
    access: { read: () => true },
    fields: [lockedField],
  },
]

// The pattern the signed URLs guide documents: a field of the document decides, and the admin
// always gets the original.
const lockedCheck = (req: any, doc: any) => {
  seen.push(doc)
  return doc.locked !== true || isAdmin(req)
}

const pluginCollections = Object.fromEntries(
  collections.map(({ slug }) => [
    slug,
    { privateFiles: { enabled: true, customAuthCheck: lockedCheck } },
  ]),
)

type User = NonNullable<PayloadRequest['user']>
type Uploaded = { id: number; cloudinaryPublicId: string; cloudinaryVersion: number }

const signedOriginal = (doc: Uploaded) =>
  new RegExp(
    `^${BASE}/authenticated/s--[\\w-]{8}--/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
  )

const expectNoURLFields = (doc: Record<string, unknown>, label: string) => {
  for (const field of URL_FIELDS) expect(doc[field] ?? null, `${label} ${field}`).toBeNull()
  expect(JSON.stringify(doc), label).not.toContain('res.cloudinary.com')
}

describe('the access rule reads the stored row as the reader sees it', () => {
  let harness: PayloadHarness
  let admin: TestUser
  let member: TestUser
  let adminUser: User

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections,
      localization: { locales: ['en', 'es'], defaultLocale: 'en', fallback: true },
    })
    admin = await harness.createUser()
    member = await harness.createUser()
    expect(admin.email).toBe(ADMIN_EMAIL)
    adminUser = await harness.userOf(admin)
  })

  afterAll(async () => {
    await harness?.stop()
  })

  beforeEach(() => {
    seen.length = 0
    failStoredRead = false
  })

  const upload = async (
    collection: string,
    filename: string,
    data: Record<string, unknown>,
  ): Promise<Uploaded> => {
    const res = await harness.request(`/api/${collection}?locale=en`, {
      method: 'POST',
      body: pngUpload(filename, data),
      user: admin,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc
  }

  const patch = async (path: string, data: Record<string, unknown>) => {
    const res = await harness.request(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      user: admin,
    })
    expect(res.status, path).toBe(200)
  }

  const read = async (path: string, reader?: TestUser) => {
    const res = await harness.request(path, { user: reader })
    expect(res.status, path).toBe(200)
    return res.json()
  }

  const single = (id: unknown, query: string, reader?: TestUser) =>
    harness.request(`/api/localized/signed-url/${id}${query}`, { user: reader })

  const batch = (ids: unknown[], query: string, reader?: TestUser) =>
    harness.request(`/api/localized/signed-urls${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.map(String) }),
      user: reader,
    })

  const helper = async (id: unknown, locale: string | undefined, user?: User) =>
    getSignedURL({
      payload: harness.payload,
      collection: 'localized',
      docId: id as number,
      req: await createPayloadRequest({ locale: locale as any, user, payload: harness.payload }),
    })

  // Every query a reader can add to choose the locale. No query reads the default locale.
  const LOCALE_QUERIES = ['', '?locale=en', '?locale=es', '?locale=all']

  describe('a localized field the check reads', () => {
    it('refuses an anonymous reader in every locale when the document is locked', async () => {
      // Locked in `en` only. A read in `es` falls back to `en`, so it shows `locked: true`.
      const doc = await upload('localized', 'locked.png', { locked: true })

      for (const query of LOCALE_QUERIES) {
        const body = await read(`/api/localized/${doc.id}${query}`)
        expectNoURLFields(body, `read ${query}`)

        const res = await single(doc.id, query)
        expect(res.status, `signed-url ${query}`).toBe(403)
        expect(JSON.stringify(await res.json())).not.toContain('res.cloudinary.com')

        const { results } = await (await batch([doc.id], query)).json()
        expect(results, `signed-urls ${query}`).toEqual([
          { id: String(doc.id), status: 403, error: 'Access denied' },
        ])
      }

      for (const locale of [undefined, 'en', 'es', 'all']) {
        expect(await helper(doc.id, locale), `getSignedURL ${locale}`).toBeNull()
      }
    })

    it('refuses in every locale when one locale locks the document', async () => {
      const doc = await upload('localized', 'locked-es.png', { locked: false })
      await patch(`/api/localized/${doc.id}?locale=es`, { locked: true })

      // Only `es` shows `locked: true`, but the file is the same in every locale, so a reader
      // who asks for `en` is refused too.
      for (const query of LOCALE_QUERIES) {
        expectNoURLFields(await read(`/api/localized/${doc.id}${query}`), `read ${query}`)
        expect((await single(doc.id, query)).status, `signed-url ${query}`).toBe(403)
        const { results } = await (await batch([doc.id], query)).json()
        expect(results[0].status, `signed-urls ${query}`).toBe(403)
      }
      for (const locale of [undefined, 'en', 'es', 'all']) {
        expect(await helper(doc.id, locale), `getSignedURL ${locale}`).toBeNull()
      }

      // The admin passes the check in every locale, so still gets the original
      const body = await read(`/api/localized/${doc.id}?locale=en`, admin)
      expect(pathOf(body.url)).toMatch(signedOriginal(doc))
    })

    it('refuses a version read in every locale when one locale locks the document', async () => {
      const doc = await upload('versioned', 'version-locked-es.png', { locked: false })
      await patch(`/api/versioned/${doc.id}?locale=es`, { locked: true })
      // Listing the versions is a trusted test step, so it skips access on purpose
      const { docs: versions } = await harness.payload.findVersions({
        collection: 'versioned',
        where: { parent: { equals: doc.id } },
        req: await createPayloadRequest({ payload: harness.payload }),
        overrideAccess: true,
        depth: 0,
      })

      for (const version of versions) {
        for (const query of LOCALE_QUERIES) {
          const body = await read(`/api/versioned/versions/${version.id}${query}`, member)
          expectNoURLFields(body.version, `version ${version.id} ${query}`)
        }
      }
    })

    it('still gives a reader the check allows a signed URL in each locale', async () => {
      const locked = await upload('localized', 'allowed-locked.png', { locked: true })
      const open = await upload('localized', 'allowed-open.png', { locked: false })
      await patch(`/api/localized/${open.id}?locale=es`, { locked: false })

      for (const [label, doc, reader, user] of [
        ['admin', locked, admin, adminUser],
        ['anonymous', open, undefined, undefined],
      ] as const) {
        for (const query of LOCALE_QUERIES) {
          const name = `${label} ${query}`
          const body = await read(`/api/localized/${doc.id}${query}`, reader)
          expect(pathOf(body.url), `read ${name}`).toMatch(signedOriginal(doc))

          const res = await single(doc.id, query, reader)
          expect(res.status, `signed-url ${name}`).toBe(200)
          expect(pathOf((await res.json()).url)).toMatch(signedOriginal(doc))

          const { results } = await (await batch([doc.id], query, reader)).json()
          expect(pathOf(results[0].url), `signed-urls ${name}`).toMatch(signedOriginal(doc))
        }

        for (const locale of [undefined, 'en', 'es', 'all']) {
          const url = await helper(doc.id, locale, user)
          expect(pathOf(url!), `getSignedURL ${label} ${locale}`).toMatch(signedOriginal(doc))
        }
      }
    })

    it('gives customAuthCheck the value the read shows, not one keyed by locale', async () => {
      const doc = await upload('localized', 'shape.png', { locked: true })
      seen.length = 0

      await read(`/api/localized/${doc.id}?locale=es`)

      // One read runs the check at most once per locale. `es` falls back to `en`, so every
      // locale shows `locked: true`.
      expect(seen.length).toBeGreaterThan(0)
      expect(seen.length).toBeLessThanOrEqual(2)
      for (const view of seen) {
        expect(view.locked).toBe(true)
        expect(view.id).toBe(doc.id)
      }
    })

    it('runs no collection afterRead hook again for its stored read', async () => {
      const doc = await upload('localized', 'hooks.png', { locked: false })
      siteHookRuns = 0

      await read(`/api/localized/${doc.id}`)
      expect(siteHookRuns).toBe(1)

      siteHookRuns = 0
      expect((await single(doc.id, '')).status).toBe(200)
      // The endpoint's lookup is one read, so the site's hook runs once
      expect(siteHookRuns).toBe(1)
    })

    it('fails closed when it cannot read the stored row as the reader sees it', async () => {
      const doc = await upload('localized', 'unflattened.png', { locked: false })
      failStoredRead = true

      for (const reader of [undefined, admin]) {
        const label = reader?.email ?? 'anonymous'
        expectNoURLFields(await read(`/api/localized/${doc.id}`, reader), `read ${label}`)

        const res = await single(doc.id, '', reader)
        expect(res.status, `signed-url ${label}`).toBe(403)
        expect(JSON.stringify(await res.json())).not.toContain('res.cloudinary.com')

        const { results } = await (await batch([doc.id], '', reader)).json()
        expect(results, `signed-urls ${label}`).toEqual([
          { id: String(doc.id), status: 403, error: 'Access denied' },
        ])
      }
      expect(await helper(doc.id, undefined, adminUser)).toBeNull()
    })
  })

  describe('a version read', () => {
    const versionsOf = async (collection: string, parent: number) => {
      // Listing the versions is a trusted test step, so it skips access on purpose
      const { docs } = await harness.payload.findVersions({
        collection: collection as 'versioned',
        where: { parent: { equals: parent } },
        sort: 'createdAt',
        req: await createPayloadRequest({ payload: harness.payload }),
        overrideAccess: true,
        depth: 0,
      })
      return docs
    }

    it('gives no URL for an old version that passes the check when the document fails it', async () => {
      const doc = await upload('versioned', 'stale.png', { locked: false })
      await patch(`/api/versioned/${doc.id}`, { locked: true })
      // Payload v4 saves a create as two versions: the insert and the upload metadata write-back
      const [stale, current] = (await versionsOf('versioned', doc.id)).slice(-2)
      expect(stale.version.locked).toBe(false)
      expect(current.version.locked).toBe(true)

      const body = await read(`/api/versioned/versions/${stale.id}`, member)
      expect(body.version.locked).toBe(false)
      expectNoURLFields(body.version, 'REST version by ID')

      const local = await harness.payload.findVersionByID({
        collection: 'versioned',
        id: stale.id,
        req: await createPayloadRequest({
          user: await harness.userOf(member),
          payload: harness.payload,
        }),
        overrideAccess: false,
      })
      expectNoURLFields(local.version, 'Local API version by ID')
    })

    it('gives no URL for a version that fails the check when the document passes it', async () => {
      const doc = await upload('versioned', 'unlocked-later.png', { locked: true })
      await patch(`/api/versioned/${doc.id}`, { locked: false })
      const [lockedVersion] = await versionsOf('versioned', doc.id)

      const body = await read(`/api/versioned/versions/${lockedVersion.id}`, member)
      expect(body.version.locked).toBe(true)
      expectNoURLFields(body.version, 'version by ID')
    })

    it('gives no URL for a draft that passes the check when the published row fails it', async () => {
      const doc = await upload('drafted', 'draft.png', { locked: true, _status: 'published' })
      await patch(`/api/drafted/${doc.id}?draft=true`, { locked: false })
      const versions = await versionsOf('drafted', doc.id)
      const draft = versions[versions.length - 1]
      expect(draft.version._status).toBe('draft')
      expect(draft.version.locked).toBe(false)

      const byID = await read(`/api/drafted/versions/${draft.id}`, member)
      expect(byID.version.locked).toBe(false)
      expectNoURLFields(byID.version, 'draft version by ID')

      for (const query of ['?draft=true', '?draft=true&locale=all']) {
        const body = await read(`/api/drafted/${doc.id}${query}`, member)
        expectNoURLFields(body, `drafts read ${query}`)
      }
    })

    it('still gives a reader both decisions allow a signed URL of the version', async () => {
      const doc = await upload('drafted', 'allowed-draft.png', {
        locked: false,
        _status: 'published',
      })
      await patch(`/api/drafted/${doc.id}?draft=true`, { locked: false })
      const versions = await versionsOf('drafted', doc.id)

      for (const version of versions) {
        const body = await read(`/api/drafted/versions/${version.id}`, member)
        expect(pathOf(body.version.url)).toMatch(signedOriginal(doc))
      }

      const locked = await upload('versioned', 'admin-version.png', { locked: true })
      const [lockedVersion] = await versionsOf('versioned', locked.id)
      const body = await read(`/api/versioned/versions/${lockedVersion.id}?locale=all`, admin)
      expect(pathOf(body.version.url)).toMatch(signedOriginal(locked))
    })
  })
})
