import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPayloadRequest } from 'payload'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`

describe('deleting a private row from before 1.3.0', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({ pluginCollections: { media: { privateFiles: true } } })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('destroys its authenticated asset', async () => {
    const res = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload('legacy-private.png'),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()

    // A 1.x private row: an authenticated asset, no cloudinaryType, a stored authenticated URL,
    // and no v4 `_objectKey` folder
    await harness.payload.db.updateOne({
      collection: 'media',
      id: doc.id,
      data: {
        cloudinaryType: null,
        url: `${BASE}/authenticated/s--abcdefgh--/v1/${doc.cloudinaryPublicId}.png`,
        _objectKey: null,
        original: { filename: null, url: null, _objectKey: null },
      },
      req: await createPayloadRequest({ payload: harness.payload }),
    })

    const deleted = await harness.request(`/api/media/${doc.id}`, { method: 'DELETE', user })
    expect(deleted.status).toBe(200)

    const destroy = harness.cloudinary.calls.find(
      (c) => c.method === 'destroy' && c.publicId === doc.cloudinaryPublicId,
    )
    expect(destroy?.options.type).toBe('authenticated')
  })
})
