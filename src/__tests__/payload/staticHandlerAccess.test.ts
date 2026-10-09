import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type CollectionConfig, type PayloadRequest } from 'payload'
import { createStaticHandler } from '../../handlers/staticHandler'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`

// createUser numbers its users from 1, so the first user created is the admin.
const ADMIN_EMAIL = 'user-1@example.com'
const isAdmin = (req: { user?: { email?: string } | null }) => req.user?.email === ADMIN_EMAIL

const collections: CollectionConfig[] = [
  {
    slug: 'localized',
    upload: true,
    access: { read: () => true },
    fields: [{ name: 'locked', type: 'checkbox', localized: true }],
  },
]

const pluginOptions = {
  cloudConfig: TEST_CLOUD,
  collections: {
    localized: {
      privateFiles: {
        enabled: true,
        customAuthCheck: (req: any, doc: any) => doc.locked !== true || isAdmin(req),
      },
    },
  },
}

type User = NonNullable<PayloadRequest['user']>
type Uploaded = {
  id: number
  filename: string
  cloudinaryPublicId: string
  cloudinaryVersion: number
}

const signedOriginal = (doc: Uploaded) =>
  new RegExp(
    `^${BASE}/authenticated/s--[\\w-]{8}--/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
  )

// The plugin installs with `disablePayloadAccessControl: true`, so Payload never routes a file
// request to the static handler. These tests call it directly, the way Payload's file endpoint
// would if a later change registered it: with the row Payload's file access check returns, or
// with no document when the collection's `read` access returns `true`.
describe('the static handler decides like the plugin', () => {
  let harness: PayloadHarness
  let admin: TestUser
  let adminUser: User
  const handler = createStaticHandler(pluginOptions)

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections: pluginOptions.collections,
      localization: { locales: ['en', 'es'], defaultLocale: 'en', fallback: true },
    })
    admin = await harness.createUser()
    expect(admin.email).toBe(ADMIN_EMAIL)
    adminUser = await harness.userOf(admin)
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (filename: string, data: Record<string, unknown>) => {
    const res = await harness.request('/api/localized?locale=en', {
      method: 'POST',
      body: pngUpload(filename, data),
      user: admin,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc as Uploaded
  }

  const lockInSpanish = async (id: number) => {
    const res = await harness.request(`/api/localized/${id}?locale=es`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: true }),
      user: admin,
    })
    expect(res.status).toBe(200)
  }

  // Calls the handler as Payload's file endpoint does. `withRow` passes the raw database row that
  // Payload's file access check reads when `read` access returns a query.
  const serve = async (doc: Uploaded, user: User | undefined, withRow: boolean) => {
    const req = await createLocalReq({ user }, harness.payload)
    const row = withRow
      ? await harness.payload.db.findOne({
          collection: 'localized',
          where: { filename: { equals: doc.filename } },
          req,
        })
      : undefined
    return handler(req, {
      params: { collection: 'localized', filename: doc.filename },
      doc: row ?? undefined,
    } as any)
  }

  it('refuses an anonymous reader when any locale locks the document', async () => {
    const lockedEn = await upload('handler-locked-en.png', { locked: true })
    const lockedEs = await upload('handler-locked-es.png', { locked: false })
    await lockInSpanish(lockedEs.id)

    for (const doc of [lockedEn, lockedEs]) {
      for (const withRow of [true, false]) {
        const res = await serve(doc, undefined, withRow)
        const label = `${doc.filename} ${withRow ? 'with row' : 'without row'}`
        expect(res.status, label).toBe(404)
        expect(res.headers.get('Location'), label).toBeNull()
      }
    }
  })

  it('redirects a reader the rule allows to the signed original', async () => {
    const locked = await upload('handler-admin.png', { locked: true })
    const open = await upload('handler-open.png', { locked: false })

    for (const [doc, user] of [
      [locked, adminUser],
      [open, undefined],
    ] as const) {
      for (const withRow of [true, false]) {
        const res = await serve(doc, user, withRow)
        expect(res.status, doc.filename).toBe(302)
        expect(res.headers.get('Location')?.split('?')[0]).toMatch(signedOriginal(doc))
      }
    }
  })

  it('redirects to the URL built from the stored fields, not to a stored Cloudinary URL', async () => {
    const doc = await upload('handler-public.png', { isPrivate: false })
    // A row from an older version can still hold a delivery URL
    const stale = `${BASE}/upload/v1600000000/stale/asset.png`
    await harness.payload.db.updateOne({
      collection: 'localized',
      id: doc.id,
      data: { cloudinaryUrl: stale },
      req: await createLocalReq({}, harness.payload),
    })

    for (const withRow of [true, false]) {
      const res = await serve(doc, undefined, withRow)
      expect(res.status).toBe(302)
      expect(res.headers.get('Location')?.split('?')[0]).toBe(
        `${BASE}/upload/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}.png`,
      )
    }
  })

  it('refuses a filename no document has', async () => {
    const res = await handler(await createLocalReq({ user: adminUser }, harness.payload), {
      params: { collection: 'localized', filename: 'no-such-file.png' },
    } as any)
    expect(res.status).toBe(404)
  })
})
