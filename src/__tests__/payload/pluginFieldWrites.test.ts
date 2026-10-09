import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Access, type CollectionConfig } from 'payload'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// Each user reads, updates and deletes only the files they own.
const ownFiles: Access = ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false)

const collections: CollectionConfig[] = [
  {
    slug: 'media',
    upload: true,
    access: { read: ownFiles, update: ownFiles, delete: ownFiles },
    fields: [{ name: 'owner', type: 'relationship', relationTo: 'users' }],
  },
  // Every plugin field there is: private files, a dynamic folder, presets and the preview.
  {
    slug: 'previews',
    upload: true,
    fields: [{ name: 'alt', type: 'text' }],
  },
]

// A value for each field the plugin manages that no upload or rename would write.
const FORGED = {
  cloudinaryPublicId: 'forged/someone-else',
  cloudinaryType: 'upload',
  cloudinaryVersion: 1,
  cloudinaryResourceType: 'raw',
  cloudinaryFormat: 'exe',
  cloudinaryUrl: 'https://forged.example/cloudinaryUrl',
  originalUrl: 'https://forged.example/originalUrl',
  transformedUrl: 'https://forged.example/transformedUrl',
  filesize: 1,
  requiresSignedURL: false,
  publicTransformationUrl: 'https://forged.example/publicTransformationUrl',
  publicTransformationPublicId: 'forged/preview',
  previewUrl: 'https://forged.example/previewUrl',
} as const
const MANAGED_FIELDS = Object.keys(FORGED) as (keyof typeof FORGED)[]

describe('plugin-managed fields are read-only to API writes', () => {
  let harness: PayloadHarness
  let victim: TestUser
  let attacker: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections: {
        media: { privateFiles: true },
        previews: {
          privateFiles: true,
          folder: { path: 'originals', enableDynamic: true },
          transformations: {
            default: { quality: 'auto' },
            presets: [{ name: 'card', label: 'Card', transformations: { width: 400 } }],
            enablePresetSelection: true,
            preserveOriginal: true,
            publicTransformation: { enabled: true, watermark: { defaultText: 'PREVIEW' } },
          },
        },
      },
    })
    victim = await harness.createUser()
    attacker = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (
    user: TestUser,
    filename: string,
    data: Record<string, unknown> = {},
    collection = 'media',
  ) => {
    const res = await harness.request(`/api/${collection}`, {
      method: 'POST',
      body: pngUpload(filename, collection === 'media' ? { owner: user.id, ...data } : data),
      user,
    })
    expect(res.status).toBe(201)
    return (await res.json()).doc as Record<string, any>
  }

  const patch = (
    user: TestUser,
    id: string | number,
    body: FormData | Record<string, unknown>,
    collection = 'media',
  ) =>
    harness.request(`/api/${collection}/${id}`, {
      method: 'PATCH',
      ...(body instanceof FormData
        ? { body }
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      user,
    })

  // The stored row, read past every hook and every access check.
  const storedRow = async (id: string | number, collection = 'media') =>
    (await harness.payload.db.findOne<Record<string, any>>({
      collection,
      where: { id: { equals: id } },
    }))!

  const callsAfter = (before: number) => harness.cloudinary.calls.slice(before)

  describe("pointing a document at another document's asset", () => {
    // The attacker may read, update and delete their own file in full, and has learned the
    // public ID of the victim's private file.
    const plant = async (name: string) => {
      const target = await upload(victim, `${name}-victim.png`)
      const own = await upload(attacker, `${name}-attacker.png`)
      const ownRow = await storedRow(own.id)
      const res = await patch(attacker, own.id, {
        cloudinaryPublicId: target.cloudinaryPublicId,
        cloudinaryType: 'authenticated',
        cloudinaryVersion: (await storedRow(target.id)).cloudinaryVersion,
      })
      return { target, own, ownRow, res }
    }

    it('leaves the stored public ID, type and version unchanged', async () => {
      const { ownRow, own, res } = await plant('stored')

      expect(res.status).toBe(200)
      const row = await storedRow(own.id)
      expect(row.cloudinaryPublicId).toBe(ownRow.cloudinaryPublicId)
      expect(row.cloudinaryType).toBe(ownRow.cloudinaryType)
      expect(row.cloudinaryVersion).toBe(ownRow.cloudinaryVersion)
    })

    it("returns URLs of the document's own asset on a read", async () => {
      const { target, own } = await plant('read')

      const res = await harness.request(`/api/media/${own.id}`, { user: attacker })

      expect(res.status).toBe(200)
      const read = await res.json()
      for (const field of ['url', 'thumbnailURL']) {
        expect(read[field], field).toContain(own.cloudinaryPublicId)
        expect(read[field], field).not.toContain(target.cloudinaryPublicId)
      }
    })

    it("returns a signed URL of the document's own asset from the endpoint", async () => {
      const { target, own } = await plant('endpoint')

      const res = await harness.request(`/api/media/signed-url/${own.id}`, { user: attacker })

      expect(res.status).toBe(200)
      const { url } = await res.json()
      expect(url).toContain(`/authenticated/`)
      expect(url).toContain(own.cloudinaryPublicId)
      expect(url).not.toContain(target.cloudinaryPublicId)
    })

    it('destroys only its own asset on delete', async () => {
      const { target, own } = await plant('delete')
      const before = harness.cloudinary.calls.length

      const res = await harness.request(`/api/media/${own.id}`, {
        method: 'DELETE',
        user: attacker,
      })

      expect(res.status).toBe(200)
      const destroyed = callsAfter(before)
        .filter((c) => c.method === 'destroy')
        .map((c) => c.publicId)
      expect(destroyed).toEqual([own.cloudinaryPublicId])
      expect(destroyed).not.toContain(target.cloudinaryPublicId)
    })
  })

  describe('an update', () => {
    it.each([
      ['private', true],
      ['public', false],
    ])('leaves every managed field of a %s file as stored', async (_label, isPrivate) => {
      const doc = await upload(attacker, `sweep-${isPrivate}.png`, { isPrivate }, 'previews')
      const before = await storedRow(doc.id, 'previews')

      const res = await patch(attacker, doc.id, { ...FORGED, alt: 'edited' }, 'previews')

      expect(res.status).toBe(200)
      const after = await storedRow(doc.id, 'previews')
      expect(after.alt).toBe('edited')
      for (const field of MANAGED_FIELDS) {
        expect(after[field] ?? null, field).toEqual(before[field] ?? null)
      }
    })

    it('still takes the user inputs', async () => {
      const doc = await upload(attacker, 'inputs.png', {}, 'previews')
      const inputs = {
        hasPublicTransformation: true,
        transformationType: 'blur',
        watermarkText: 'MINE',
        transformationPreset: ['card'],
      }

      const res = await patch(attacker, doc.id, inputs, 'previews')

      expect(res.status).toBe(200)
      expect(await storedRow(doc.id, 'previews')).toMatchObject(inputs)
    })
  })

  describe('a create', () => {
    it.each([
      ['private', true],
      ['public', false],
    ])(
      'stores the upload result, not the managed values sent with a %s file',
      async (_label, isPrivate) => {
        const before = harness.cloudinary.calls.length

        const doc = await upload(
          attacker,
          `create-${isPrivate}.png`,
          { ...FORGED, isPrivate },
          'previews',
        )

        const [uploaded] = callsAfter(before).filter((c) => c.method === 'upload_stream')
        const result = uploaded.result
        const row = await storedRow(doc.id, 'previews')
        const fromUpload: Record<string, unknown> = {
          cloudinaryPublicId: result.public_id,
          cloudinaryType: isPrivate ? 'authenticated' : 'upload',
          cloudinaryVersion: result.version,
          cloudinaryResourceType: result.resource_type,
          cloudinaryFormat: result.format,
          filesize: result.bytes,
          requiresSignedURL: isPrivate,
        }
        expect(row).toMatchObject(fromUpload)
        // The upload writes no value of its own to the rest, so none may hold the caller's.
        for (const field of MANAGED_FIELDS.filter((f) => !(f in fromUpload))) {
          expect(row[field] ?? null, field).not.toEqual(FORGED[field])
        }
      },
    )
  })

  describe("the plugin's own writes", () => {
    // Every case also sends a forged public ID, which the plugin must neither act on nor store.
    const forged = { cloudinaryPublicId: FORGED.cloudinaryPublicId, cloudinaryVersion: 1 }

    it('a privacy toggle renames its own asset and stores the result', async () => {
      const doc = await upload(attacker, 'toggle.png', { isPrivate: false }, 'previews')
      const before = harness.cloudinary.calls.length

      const res = await patch(attacker, doc.id, { ...forged, isPrivate: true }, 'previews')

      expect(res.status).toBe(200)
      const renames = callsAfter(before).filter((c) => c.method === 'rename')
      expect(renames.map((c) => c.publicId)).toEqual([doc.cloudinaryPublicId])
      expect(await storedRow(doc.id, 'previews')).toMatchObject({
        cloudinaryPublicId: doc.cloudinaryPublicId,
        cloudinaryType: 'authenticated',
        cloudinaryVersion: renames[0].result.version,
        requiresSignedURL: true,
      })
    })

    it('a folder move renames its own asset and stores the new public ID', async () => {
      const doc = await upload(attacker, 'move.png', {}, 'previews')
      const movedId = `moved/${String(doc.cloudinaryPublicId).split('/').pop()}`
      const before = harness.cloudinary.calls.length

      const res = await patch(
        attacker,
        doc.id,
        { ...forged, cloudinaryFolder: 'moved' },
        'previews',
      )

      expect(res.status).toBe(200)
      const renames = callsAfter(before).filter((c) => c.method === 'rename')
      expect(renames.map((c) => c.publicId)).toEqual([doc.cloudinaryPublicId])
      expect(await storedRow(doc.id, 'previews')).toMatchObject({
        cloudinaryPublicId: movedId,
        cloudinaryType: 'authenticated',
        cloudinaryVersion: renames[0].result.version,
      })
    })

    it('a replacement upload deletes its own old asset and stores the new one', async () => {
      const doc = await upload(attacker, 'replace-old.png', {}, 'previews')
      const before = harness.cloudinary.calls.length

      const res = await patch(attacker, doc.id, pngUpload('replace-new.png', forged), 'previews')

      expect(res.status).toBe(200)
      const calls = callsAfter(before)
      expect(calls.filter((c) => c.method === 'destroy').map((c) => c.publicId)).toEqual([
        doc.cloudinaryPublicId,
      ])
      const [uploaded] = calls.filter((c) => c.method === 'upload_stream')
      expect(await storedRow(doc.id, 'previews')).toMatchObject({
        cloudinaryPublicId: uploaded.result.public_id,
        cloudinaryType: 'authenticated',
        cloudinaryVersion: uploaded.result.version,
      })
    })
  })

  describe('the Local API', () => {
    const localUpdate = async (id: string | number, overrideAccess: boolean) =>
      harness.payload.update({
        collection: 'media',
        id,
        data: { cloudinaryPublicId: FORGED.cloudinaryPublicId },
        req: await createLocalReq({ user: await harness.userOf(attacker) }, harness.payload),
        overrideAccess,
      })

    it('ignores a managed field with overrideAccess: false', async () => {
      const doc = await upload(attacker, 'local-enforced.png')

      await localUpdate(doc.id, false)

      expect((await storedRow(doc.id)).cloudinaryPublicId).toBe(doc.cloudinaryPublicId)
    })

    it('writes a managed field with overrideAccess: true, for trusted server code', async () => {
      const doc = await upload(attacker, 'local-trusted.png')

      await localUpdate(doc.id, true)

      expect((await storedRow(doc.id)).cloudinaryPublicId).toBe(FORGED.cloudinaryPublicId)
    })
  })
})
