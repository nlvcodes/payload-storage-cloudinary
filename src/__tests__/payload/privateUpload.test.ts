import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPayloadRequest, type CollectionConfig } from 'payload'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

const uploadCollection = (slug: string): CollectionConfig => ({
  slug,
  upload: true,
  fields: [],
})

describe('private originals upload as authenticated', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [uploadCollection('media'), uploadCollection('previews')],
      pluginCollections: {
        media: { privateFiles: true },
        previews: {
          privateFiles: true,
          transformations: {
            // The `default` key makes the plugin read this as the organized format.
            default: {},
            publicTransformation: { enabled: true, watermark: { defaultText: 'Preview' } },
          },
        },
      },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  const upload = async (
    collection: string,
    filename: string,
    data: Record<string, unknown> = {},
  ) => {
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
    return { doc, call }
  }

  it('uploads a private original as authenticated', async () => {
    const { call } = await upload('media', 'plain.png')

    expect(call?.options.type).toBe('authenticated')
  })

  it('uploads a private original as authenticated with publicTransformation', async () => {
    const { call } = await upload('previews', 'watermarked.png', {
      hasPublicTransformation: true,
    })

    expect(call?.options.type).toBe('authenticated')
  })

  it('uploads a file marked public as upload', async () => {
    const { call } = await upload('media', 'public.png', { isPrivate: false })

    expect(call?.options.type ?? 'upload').toBe('upload')
  })

  it('stores the delivery type from the upload result', async () => {
    const { doc: privateDoc } = await upload('previews', 'stored-private.png')
    const { doc: publicDoc } = await upload('media', 'stored-public.png', { isPrivate: false })

    // Reading the stored row is a trusted check, so it skips access on purpose.
    const req = await createPayloadRequest({ payload: harness.payload })
    const readPrivate = await harness.payload.findByID({
      collection: 'previews',
      id: privateDoc.id,
      req,
      overrideAccess: true,
    })
    const readPublic = await harness.payload.findByID({
      collection: 'media',
      id: publicDoc.id,
      req,
      overrideAccess: true,
    })
    expect(readPrivate.cloudinaryType).toBe('authenticated')
    expect(readPublic.cloudinaryType).toBe('upload')
  })
})
