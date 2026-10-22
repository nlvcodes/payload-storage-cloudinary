import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness } from './harness'

describe('real Payload harness', () => {
  let harness: PayloadHarness

  beforeAll(async () => {
    harness = await startPayload()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('boots without spawning a generate:types process', () => {
    expect(harness.config.typescript.autoGenerate).toBe(false)
  })

  it('uploads a private file through REST and reads it back', async () => {
    const user = await harness.createUser()

    const createRes = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload('secret.png'),
      user,
    })
    expect(createRes.status).toBe(201)
    const { doc: created } = await createRes.json()

    const uploads = harness.cloudinary.calls.filter((call) => call.method === 'upload_stream')
    expect(uploads).toHaveLength(1)
    expect(uploads[0].options.type).toBe('authenticated')
    expect(uploads[0].bytes).toBeGreaterThan(0)

    const readRes = await harness.request(`/api/media/${created.id}`, { user })
    expect(readRes.status).toBe(200)
    const read = await readRes.json()
    expect(read.id).toBe(created.id)
    // Payload v4 stores an untransformed upload as `<name>-original.<ext>`
    expect(read.filename).toBe('secret-original.png')
    expect(read.isPrivate).toBe(true)
    expect(read.cloudinaryPublicId).toBe(uploads[0].result.public_id)
  })

  it('gives a test user as Payload puts it on req.user', async () => {
    const user = await harness.createUser()

    const reqUser = await harness.userOf(user)

    expect(reqUser.collection).toBe('users')
    expect(reqUser.id).toBe(user.id)
    expect(reqUser.email).toBe(user.email)
  })

  it('refuses a read with no logged-in user under default access', async () => {
    const user = await harness.createUser()
    const createRes = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload('another.png'),
      user,
    })
    const { doc } = await createRes.json()

    const anonymousRes = await harness.request(`/api/media/${doc.id}`)
    expect(anonymousRes.status).toBe(403)
  })

  it('gives sequential IDs, like Postgres', async () => {
    const user = await harness.createUser()
    const ids: unknown[] = []
    for (const name of ['one.png', 'two.png']) {
      const res = await harness.request('/api/media', {
        method: 'POST',
        body: pngUpload(name),
        user,
      })
      ids.push((await res.json()).doc.id)
    }

    expect(typeof ids[0]).toBe('number')
    expect(ids[1]).toBe((ids[0] as number) + 1)
  })

  it('boots a fresh database after stop, with the Cloudinary API restored', async () => {
    await harness.stop()
    expect(vi.isMockFunction(cloudinary.uploader.upload_stream)).toBe(false)

    harness = await startPayload()
    const user = await harness.createUser()
    expect(user.id).toBe(1)
    expect(harness.cloudinary.calls).toHaveLength(0)
  })

  it('mocks only the network calls, so cloudinary.url() signs for real', () => {
    expect(vi.isMockFunction(cloudinary.uploader.upload_stream)).toBe(true)
    expect(vi.isMockFunction(cloudinary.url)).toBe(false)

    const signed = cloudinary.url('folder/asset', { type: 'authenticated', sign_url: true })
    const cloudName = TEST_CLOUD.cloud_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(signed).toMatch(
      new RegExp(
        `^https://res\\.cloudinary\\.com/${cloudName}/image/authenticated/s--[\\w-]{8}--/v1/folder/asset\\b`,
      ),
    )
  })
})

describe('harness lifecycle', () => {
  const FORCE_PUSH = 'PAYLOAD_FORCE_DRIZZLE_PUSH'
  const outerForcePush = process.env[FORCE_PUSH]

  afterEach(() => {
    if (outerForcePush === undefined) delete process.env[FORCE_PUSH]
    else process.env[FORCE_PUSH] = outerForcePush
  })

  it('makes a second stop a no-op', async () => {
    const harness = await startPayload()
    const destroy = vi.spyOn(harness.payload, 'destroy')

    await harness.stop()
    await harness.stop()

    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'false'])('restores %s as the force-push setting on stop', async (before) => {
    if (before === undefined) delete process.env[FORCE_PUSH]
    else process.env[FORCE_PUSH] = before

    const harness = await startPayload()
    expect(process.env[FORCE_PUSH]).toBe('true')
    await harness.stop()

    expect(process.env[FORCE_PUSH]).toBe(before)
  })

  it('restores the force-push setting when boot fails', async () => {
    delete process.env[FORCE_PUSH]

    // Two collections with one slug fail Payload's config sanitization.
    await expect(startPayload({ collections: [{ slug: 'users', fields: [] }] })).rejects.toThrow(
      'Collection slug already in use',
    )

    expect(process.env[FORCE_PUSH]).toBeUndefined()
  })
})
