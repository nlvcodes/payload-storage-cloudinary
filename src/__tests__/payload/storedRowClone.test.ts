import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createPayloadRequest, type CollectionConfig, type PayloadRequest } from 'payload'
import { getSignedURL, isAccessAllowedByID } from '../../index'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

/**
 * A stand-in for the ObjectId the MongoDB adapter can return. Like bson's, its `_bsontype` is a
 * getter on the prototype, and its value lives on the instance.
 */
class FakeObjectId {
  constructor(private readonly hex: string) {}
  get _bsontype() {
    return 'ObjectId'
  }
  toHexString() {
    return this.hex
  }
  toString() {
    return this.hex
  }
}

/** A value no adapter returns, which the plugin can't know how to copy. */
class Unknown {
  readonly run = () => 'not data'
}

// The owner of a document gets the original. `locked` is localized, so the plugin reads the row
// once per locale, from a copy of what the database adapter returned.
const collections: CollectionConfig[] = [
  {
    slug: 'owned',
    upload: true,
    access: { read: () => true },
    fields: [
      { name: 'locked', type: 'checkbox', localized: true },
      { name: 'owner', type: 'relationship', relationTo: 'users' },
      { name: 'extra', type: 'json' },
    ],
  },
]

const pluginCollections = {
  owned: {
    privateFiles: {
      enabled: true,
      customAuthCheck: (req: any, doc: any) =>
        doc.locked !== true && String(doc.owner) === String(req.user?.id),
    },
  },
}

type User = NonNullable<PayloadRequest['user']>

describe('the stored row keeps every value the database adapter returns', () => {
  let harness: PayloadHarness
  let owner: TestUser
  let ownerUser: User
  // Restored one by one: restoring every mock would undo the harness's Cloudinary mock too
  const spies: MockInstance[] = []

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections,
      localization: { locales: ['en', 'es'], defaultLocale: 'en', fallback: true },
    })
    owner = await harness.createUser()
    ownerUser = await harness.userOf(owner)
  })

  afterAll(async () => {
    await harness?.stop()
  })

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
  })

  const upload = async (filename: string) => {
    const res = await harness.request('/api/owned?locale=en', {
      method: 'POST',
      body: pngUpload(filename, { locked: false, owner: owner.id }),
      user: owner,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc as { id: number }
  }

  /**
   * Makes the database adapter's `find`, the read the plugin decides on, return rows the way the
   * MongoDB adapter can: with `rewrite` applied to each row. SQLite returns plain JSON only.
   */
  const adapterReturns = (rewrite: (row: Record<string, any>) => void) => {
    const find = harness.payload.db.find.bind(harness.payload.db)
    spies.push(
      vi.spyOn(harness.payload.db, 'find').mockImplementation(async (args: any) => {
        const result = await find(args)
        if (args.collection === 'owned') result.docs.forEach(rewrite)
        return result
      }),
    )
  }

  const decide = async (id: number, user?: User) => {
    const req = await createPayloadRequest({ user, payload: harness.payload })
    return {
      allowed: await isAccessAllowedByID({ req, collection: 'owned', id }),
      url: await getSignedURL({ payload: harness.payload, collection: 'owned', docId: id, req }),
    }
  }

  it('keeps an ObjectId, so a check that reads it still decides', async () => {
    const doc = await upload('object-id.png')
    adapterReturns((row) => {
      row.owner = new FakeObjectId(String(row.owner))
      row.extra = { createdBy: new FakeObjectId(String(row.owner)), at: new Date(0) }
    })

    const forOwner = await decide(doc.id, ownerUser)
    expect(forOwner.allowed).toBe(true)
    expect(forOwner.url).not.toBeNull()

    const forAnonymous = await decide(doc.id)
    expect(forAnonymous.allowed).toBe(false)
    expect(forAnonymous.url).toBeNull()
  })

  it('fails closed when the row holds a value it cannot copy', async () => {
    const doc = await upload('unknown.png')
    adapterReturns((row) => {
      row.extra = { value: new Unknown() }
    })
    spies.push(vi.spyOn(console, 'error').mockImplementation(() => {}))

    const forOwner = await decide(doc.id, ownerUser)
    expect(forOwner.allowed).toBe(false)
    expect(forOwner.url).toBeNull()

    const res = await harness.request(`/api/owned/${doc.id}`, { user: owner })
    expect(res.status).toBe(200)
    const body = await res.json()
    for (const field of ['url', 'thumbnailURL', 'transformedUrl', 'previewUrl']) {
      expect(body[field] ?? null, field).toBeNull()
    }
  })
})
