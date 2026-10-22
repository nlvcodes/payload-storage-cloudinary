import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionConfig } from 'payload'
import { pngUpload, startPayload, type PayloadHarness, type TestUser } from './harness'

// A later hook fails the create after Payload staged and uploaded its file.
const files: CollectionConfig = {
  slug: 'files',
  upload: true,
  access: { read: () => true },
  fields: [{ name: 'alt', type: 'text' }],
  hooks: {
    afterChange: [
      ({ doc }) => {
        if (doc.alt === 'fail') throw new Error('a later hook fails')
      },
    ],
  },
}

describe('a create that a later hook fails', () => {
  let harness: PayloadHarness
  let user: TestUser

  beforeAll(async () => {
    harness = await startPayload({
      collections: [files],
      pluginCollections: { files: { useFilename: true } },
    })
    user = await harness.createUser()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('keeps the asset that another document references', async () => {
    const created = await harness.request('/api/files', {
      method: 'POST',
      body: pngUpload('logo.png', { alt: 'Logo' }),
      user,
    })
    expect(created.status).toBe(201)
    const { doc } = await created.json()

    // Another document with the same base name, so the same public ID under `useFilename`
    const failed = await harness.request('/api/files', {
      method: 'POST',
      body: pngUpload('logo.jpg', { alt: 'fail' }),
      user,
    })
    expect(failed.ok).toBe(false)

    const destroyed = harness.cloudinary.calls
      .filter((c) => c.method === 'destroy')
      .map((c) => c.publicId)
    expect(destroyed).not.toContain(doc.cloudinaryPublicId)
  })
})
