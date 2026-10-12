import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { createPayloadRequest, type CollectionConfig, type PayloadRequest } from 'payload'
import { getSignedURL, isAccessAllowed, isAccessAllowedByID } from '../../index'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// createUser numbers its users from 1, so the first user created is the admin.
const ADMIN_EMAIL = 'user-1@example.com'
const isAdmin = (req: { user?: { email?: string } | null }) => req.user?.email === ADMIN_EMAIL

// `localized`: anyone reads the documents, and a localized field decides who gets the original.
// `members`: Payload's default `read` access, so only a logged-in user reads the documents.
const collections: CollectionConfig[] = [
  {
    slug: 'localized',
    upload: true,
    access: { read: () => true },
    fields: [{ name: 'locked', type: 'checkbox', localized: true }],
  },
  {
    slug: 'members',
    upload: true,
    fields: [{ name: 'alt', type: 'text' }],
  },
]

// The pattern the signed URLs guide documents: a field of the document decides, and the admin
// always gets the original.
const localizedConfig = {
  privateFiles: {
    enabled: true,
    customAuthCheck: (req: any, doc: any) => doc.locked !== true || isAdmin(req),
  },
}

const pluginCollections = { localized: localizedConfig, members: { privateFiles: true } }

type User = NonNullable<PayloadRequest['user']>
type Uploaded = { id: number; filename: string }

describe('isAccessAllowedByID decides the way the plugin does', () => {
  let harness: PayloadHarness
  let admin: TestUser
  let member: TestUser
  let readers: Array<[label: string, user: User | undefined]>
  let warn: MockInstance

  let lockedEn: Uploaded
  let lockedEs: Uploaded
  let open: Uploaded
  let membersOnly: Uploaded

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections,
      localization: { locales: ['en', 'es'], defaultLocale: 'en', fallback: true },
    })
    admin = await harness.createUser()
    member = await harness.createUser()
    expect(admin.email).toBe(ADMIN_EMAIL)
    readers = [
      ['anonymous', undefined],
      ['member', await harness.userOf(member)],
      ['admin', await harness.userOf(admin)],
    ]

    // Locked in `en`, so `es` falls back to it and shows `locked: true` too
    lockedEn = await upload('localized', 'locked-en.png', { locked: true })
    // Locked in `es` only
    lockedEs = await upload('localized', 'locked-es.png', { locked: false })
    await patch(`/api/localized/${lockedEs.id}?locale=es`, { locked: true })
    open = await upload('localized', 'open.png', { locked: false })
    await patch(`/api/localized/${open.id}?locale=es`, { locked: false })
    membersOnly = await upload('members', 'members.png', {})
  })

  afterAll(async () => {
    await harness?.stop()
  })

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    return () => warn.mockRestore()
  })

  async function upload(collection: string, filename: string, data: Record<string, unknown>) {
    const res = await harness.request(`/api/${collection}?locale=en`, {
      method: 'POST',
      body: pngUpload(filename, data),
      user: admin,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc as Uploaded
  }

  async function patch(path: string, data: Record<string, unknown>) {
    const res = await harness.request(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      user: admin,
    })
    expect(res.status, path).toBe(200)
  }

  const reqFor = (user?: User, locale?: string) =>
    createPayloadRequest({ user, locale: locale as any, payload: harness.payload })

  // Every locale a reader can ask for. No locale reads the default one.
  const LOCALES = [undefined, 'en', 'es', 'all']

  it('refuses an anonymous reader when any locale locks the document', async () => {
    for (const doc of [lockedEn, lockedEs]) {
      for (const locale of LOCALES) {
        const req = await reqFor(undefined, locale)
        expect(
          await isAccessAllowedByID({ req, collection: 'localized', id: doc.id }),
          `${doc.filename} ${locale}`,
        ).toBe(false)
      }
    }
  })

  it('refuses a reader who may not read the document', async () => {
    for (const locale of LOCALES) {
      const req = await reqFor(undefined, locale)
      expect(await isAccessAllowedByID({ req, collection: 'members', id: membersOnly.id })).toBe(
        false,
      )
    }
    // No document with this ID
    const req = await reqFor(readers[2][1])
    expect(await isAccessAllowedByID({ req, collection: 'localized', id: 999_999 })).toBe(false)
  })

  it('allows a reader the check allows', async () => {
    const [, memberUser] = readers[1]
    const [, adminUser] = readers[2]
    for (const locale of LOCALES) {
      const allowed = async (user: User | undefined, collection: string, id: number) =>
        isAccessAllowedByID({ req: await reqFor(user, locale), collection, id })

      expect(await allowed(undefined, 'localized', open.id), `open ${locale}`).toBe(true)
      expect(await allowed(adminUser, 'localized', lockedEn.id), `admin ${locale}`).toBe(true)
      expect(await allowed(adminUser, 'localized', lockedEs.id), `admin ${locale}`).toBe(true)
      expect(await allowed(memberUser, 'members', membersOnly.id), `member ${locale}`).toBe(true)
    }
  })

  it('matches what getSignedURL decides for the same reader and document', async () => {
    const docs: Array<[string, Uploaded]> = [
      ['localized', lockedEn],
      ['localized', lockedEs],
      ['localized', open],
      ['members', membersOnly],
    ]
    for (const [collection, doc] of docs) {
      for (const [label, user] of readers) {
        for (const locale of LOCALES) {
          const req = await reqFor(user, locale)
          const url = await getSignedURL({
            payload: harness.payload,
            collection,
            docId: doc.id,
            req,
          })
          expect(
            await isAccessAllowedByID({ req, collection, id: doc.id }),
            `${collection} ${doc.filename} ${label} ${locale}`,
          ).toBe(url !== null)
        }
      }
    }
  })

  it('documents the limit of the doc-taking form: it decides only on the document given', async () => {
    // What the 1.3.0 guide told sites to pass: the raw database row. On a localized collection it
    // holds `locked` keyed by locale, so `doc.locked !== true` passes for every reader.
    const req = await reqFor(undefined)
    for (const doc of [lockedEn, lockedEs]) {
      const row = await harness.payload.db.findOne({
        collection: 'localized',
        where: { id: { equals: doc.id } },
        req,
      })
      expect(typeof row?.locked, doc.filename).toBe('object')
      expect(await isAccessAllowed(req, row, localizedConfig), doc.filename).toBe(true)
      expect(await isAccessAllowedByID({ req, collection: 'localized', id: doc.id })).toBe(false)
    }
  })
})

describe('isAccessAllowedByID with an ID that is not a string or a number', () => {
  it.each([[{ equals: 1 }], [[1]], [true]])('throws a TypeError for %j', async (id) => {
    await expect(
      isAccessAllowedByID({ req: { payload: {} } as any, collection: 'media', id: id as any }),
    ).rejects.toThrow(TypeError)
  })
})
