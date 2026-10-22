import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// `media: true`, the simple form in the README. 1.x never deleted its assets; 2.0 applies the documented
// `deleteFromCloudinary: true` default (a breaking change, see CHANGELOG).
describe('a collection configured as `true`', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({ pluginCollections: { media: true } })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('deletes the asset from Cloudinary with the document', async () => {
    const res = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload('simple.png'),
      user,
    })
    expect(res.status).toBe(201)
    const { doc } = await res.json()

    const deleted = await harness.request(`/api/media/${doc.id}`, { method: 'DELETE', user })
    expect(deleted.status).toBe(200)

    const destroyed = harness.cloudinary.calls
      .filter((c) => c.method === 'destroy')
      .map((c) => c.publicId)
    expect(destroyed).toContain(doc.cloudinaryPublicId)
  })
})
