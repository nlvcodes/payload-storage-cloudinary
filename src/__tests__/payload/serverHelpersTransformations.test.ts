import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPayloadRequest, type CollectionConfig, type PayloadRequest } from 'payload'
import { getPrivateImageURL, getServerImageURL, getSignedURL, getSignedURLs } from '../../index'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]

// The public ID of another private file, which a caller must never get into a signed URL.
const VICTIM = 'victim'

const collections: CollectionConfig[] = [
  // Payload's default read: any logged-in user, nobody else.
  { slug: 'media', upload: true, fields: [] },
  // A public collection, delivered from `upload` without a signature.
  { slug: 'gallery', upload: true, access: { read: () => true }, fields: [] },
]

type User = NonNullable<PayloadRequest['user']>
type StoredDoc = { id: number; cloudinaryPublicId: string; cloudinaryVersion: number }

describe('server helpers check transformations by default', () => {
  let harness: PayloadHarness
  let member: TestUser
  let memberUser: User
  let doc: StoredDoc
  let publicDoc: StoredDoc

  beforeAll(async () => {
    harness = await startPayload({
      collections,
      pluginCollections: { media: { privateFiles: true }, gallery: true },
    })
    member = await harness.createUser()
    memberUser = await harness.userOf(member)

    const upload = async (collection: string, filename: string) => {
      const res = await harness.request(`/api/${collection}`, {
        method: 'POST',
        body: pngUpload(filename),
        user: member,
      })
      expect(res.status).toBe(201)
      return (await res.json()).doc as StoredDoc
    }
    doc = await upload('media', 'helper-transform.png')
    publicDoc = await upload('gallery', 'helper-public.png')
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const signedPath = (transformation: string, of: StoredDoc = doc) =>
    new RegExp(
      `^${BASE}/authenticated/s--[\\w-]{8}--/${transformation}/v${of.cloudinaryVersion}/${of.cloudinaryPublicId}\\.png$`,
    )

  /**
   * Each helper that takes caller `transformations`, called by a reader who may get the original.
   * A helper that refuses must throw and hand back no URL.
   */
  const helpers: Record<
    string,
    (transformations: Record<string, unknown>, extra?: Record<string, unknown>) => Promise<unknown>
  > = {
    getSignedURL: (transformations, extra) =>
      getSignedURL({
        payload: harness.payload,
        collection: 'media',
        docId: doc.id,
        user: memberUser,
        transformations,
        ...extra,
      }),
    getSignedURLs: (transformations, extra) =>
      getSignedURLs({
        payload: harness.payload,
        collection: 'media',
        docIds: [doc.id],
        user: memberUser,
        transformations,
        ...extra,
      }),
    getServerImageURL: (transformations, extra) =>
      getServerImageURL(doc, {
        payload: harness.payload,
        collection: 'media',
        user: memberUser,
        transformations,
        ...extra,
      }),
    'getServerImageURL with no payload, on a public file': (transformations, extra) =>
      getServerImageURL(publicDoc, { transformations, ...extra }),
  }

  const expectRefused = async (call: Promise<unknown>) => {
    let returned: unknown
    let thrown: unknown
    try {
      returned = await call
    } catch (error) {
      thrown = error
    }
    expect(returned).toBeUndefined()
    expect(thrown).toBeInstanceOf(Error)
    const message = (thrown as Error).message
    expect(message).toMatch(/transformation/i)
    expect(message).not.toContain('res.cloudinary.com')
    expect(message).not.toContain(doc.cloudinaryPublicId)
    expect(message).not.toContain(publicDoc.cloudinaryPublicId)
    expect(message).not.toContain(VICTIM)
  }

  describe('a transformation outside the allowlist throws and returns no URL', () => {
    const refused: Record<string, Record<string, unknown>> = {
      overlay: { width: 300, overlay: `authenticated:${VICTIM}` },
      underlay: { underlay: VICTIM },
      raw_transformation: { raw_transformation: `l_authenticated:${VICTIM}` },
      'a named transformation': { transformation: 'named_preset' },
      'a key outside the allowlist': { effect: 'grayscale' },
      'a value with /': { crop: `fill/l_${VICTIM}` },
      'a value with ,': { crop: `fill,l_${VICTIM}` },
      'a value with :': { quality: `l_authenticated:${VICTIM}` },
      'a value with $': { width: '$w' },
    }

    for (const [helper, call] of Object.entries(helpers)) {
      for (const [name, transformations] of Object.entries(refused)) {
        it(`${helper} refuses ${name}`, async () => {
          await expectRefused(call(transformations))
        })
      }

      it(`${helper} refuses an overlay with overrideAccess: true`, async () => {
        await expectRefused(
          call({ overlay: `authenticated:${VICTIM}` }, { overrideAccess: true, user: undefined }),
        )
      })
    }

    it('getSignedURL refuses an overlay before it decides access, for an anonymous caller too', async () => {
      await expectRefused(
        getSignedURL({
          payload: harness.payload,
          collection: 'media',
          docId: doc.id,
          transformations: { overlay: `authenticated:${VICTIM}` },
        }),
      )
    })
  })

  describe('an allowed transformation is signed as before', () => {
    it('getSignedURL signs it', async () => {
      const url = await helpers.getSignedURL({ width: 300, crop: 'fill' })
      expect(pathOf(url as string)).toMatch(signedPath('c_fill,w_300'))
    })

    it('getSignedURLs signs it', async () => {
      const urls = (await helpers.getSignedURLs({ width: 300, crop: 'fill' })) as Record<
        string,
        string
      >
      expect(pathOf(urls[String(doc.id)])).toMatch(signedPath('c_fill,w_300'))
    })

    it('getServerImageURL signs it', async () => {
      const url = await helpers.getServerImageURL({ width: 300, crop: 'fill' })
      expect(pathOf(url as string)).toMatch(signedPath('c_fill,w_300'))
    })

    it('getServerImageURL builds it into a public file URL with no payload', async () => {
      const url = await getServerImageURL(publicDoc, { transformations: { width: 100 } })
      expect(pathOf(url!)).toBe(
        `${BASE}/upload/w_100/v${publicDoc.cloudinaryVersion}/${publicDoc.cloudinaryPublicId}.png`,
      )
    })
  })

  describe('with overrideTransformationAllowlist, a trusted caller signs a watermark overlay', () => {
    const watermark = { overlay: { font_family: 'Arial', font_size: 40, text: 'CONFIDENTIAL' } }
    const watermarked = 'l_text:Arial_40:CONFIDENTIAL'
    const trusted = { overrideTransformationAllowlist: true }

    it('getSignedURL signs it', async () => {
      const url = await helpers.getSignedURL(watermark, trusted)
      expect(pathOf(url as string)).toMatch(signedPath(watermarked))
    })

    it('getSignedURLs signs it', async () => {
      const urls = (await helpers.getSignedURLs(watermark, trusted)) as Record<string, string>
      expect(pathOf(urls[String(doc.id)])).toMatch(signedPath(watermarked))
    })

    it('getServerImageURL signs it', async () => {
      const url = await helpers.getServerImageURL(watermark, trusted)
      expect(pathOf(url as string)).toMatch(signedPath(watermarked))
    })

    it('getServerImageURL builds it into a public file URL with no payload', async () => {
      const url = await helpers['getServerImageURL with no payload, on a public file'](
        watermark,
        trusted,
      )
      expect(pathOf(url as string)).toBe(
        `${BASE}/upload/${watermarked}/v${publicDoc.cloudinaryVersion}/${publicDoc.cloudinaryPublicId}.png`,
      )
    })

    it('still applies the access rule', async () => {
      const url = await getSignedURL({
        payload: harness.payload,
        collection: 'media',
        docId: doc.id,
        transformations: watermark,
        overrideTransformationAllowlist: true,
      })
      expect(url).toBeNull()
    })
  })

  describe('getPrivateImageURL takes no caller transformations', () => {
    it('signs no transformation a caller slips into its options', async () => {
      const req = await createPayloadRequest({ user: memberUser, payload: harness.payload })
      const options = {
        payload: harness.payload,
        collection: 'media',
        req,
        transformations: { overlay: `authenticated:${VICTIM}` },
      }

      const url = await getPrivateImageURL(doc, options)

      expect(pathOf(url!)).toMatch(
        new RegExp(
          `^${BASE}/authenticated/s--[\\w-]{8}--/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}\\.png$`,
        ),
      )
    })
  })
})
