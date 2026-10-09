import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness } from './harness'
import { mockCloudinaryApi, type CloudinaryApiMock } from './harness/cloudinaryApi'

describe('Cloudinary API mock', () => {
  let mock: CloudinaryApiMock

  beforeAll(() => {
    // cloudinary.url() needs a cloud name to build the result URLs.
    cloudinary.config(TEST_CLOUD)
  })

  beforeEach(() => {
    mock = mockCloudinaryApi()
  })

  afterEach(() => {
    mock.restore()
  })

  it('accepts null options on upload_stream', async () => {
    const result = await new Promise<Record<string, any> | undefined>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(null as any, (error, res) =>
        error ? reject(error) : resolve(res),
      )
      stream.end(Buffer.from('bytes'))
    })

    expect(result?.public_id).toBe('asset-1')
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0]).toMatchObject({ method: 'upload_stream', bytes: 5 })
  })

  it('accepts the two-argument upload(file, callback) form', async () => {
    const result = await new Promise<Record<string, any> | undefined>((resolve, reject) => {
      void cloudinary.uploader.upload('file.png', (error, res) =>
        error ? reject(error) : resolve(res),
      )
    })

    expect(result?.public_id).toBe('asset-1')
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0]).toMatchObject({ method: 'upload', options: {} })
  })

  it('mocks and records the Admin API calls the plugin makes', async () => {
    expect(vi.isMockFunction(cloudinary.api.delete_derived_resources)).toBe(true)
    expect(vi.isMockFunction(cloudinary.api.root_folders)).toBe(true)
    expect(vi.isMockFunction(cloudinary.api.sub_folders)).toBe(true)

    await cloudinary.api.delete_derived_resources(['a', 'b'], { resource_type: 'image' })
    await cloudinary.api.root_folders()
    await cloudinary.api.sub_folders('products')

    expect(mock.calls.map((call) => call.method)).toEqual([
      'delete_derived_resources',
      'root_folders',
      'sub_folders',
    ])
    expect(mock.calls[0]).toMatchObject({
      args: [['a', 'b'], { resource_type: 'image' }],
      options: { resource_type: 'image' },
    })
    expect(mock.calls[2]).toMatchObject({ args: ['products'] })
  })

  it('restores the Admin API', () => {
    mock.restore()
    expect(vi.isMockFunction(cloudinary.api.delete_derived_resources)).toBe(false)
    expect(vi.isMockFunction(cloudinary.uploader.upload)).toBe(false)
    mock = mockCloudinaryApi()
  })
})

describe('Cloudinary API mock under real Payload', () => {
  let harness: PayloadHarness

  beforeAll(async () => {
    harness = await startPayload()
  })

  afterAll(async () => {
    await harness?.stop()
  })

  it('records destroy and delete_derived_resources when a document is deleted through REST', async () => {
    const user = await harness.createUser()
    const createRes = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload('doomed.png'),
      user,
    })
    expect(createRes.status).toBe(201)
    const { doc } = await createRes.json()

    const deleteRes = await harness.request(`/api/media/${doc.id}`, { method: 'DELETE', user })
    expect(deleteRes.status).toBe(200)

    const publicId = doc.cloudinaryPublicId
    const destroy = harness.cloudinary.calls.find((call) => call.method === 'destroy')
    const derived = harness.cloudinary.calls.find(
      (call) => call.method === 'delete_derived_resources',
    )
    expect(destroy?.publicId).toBe(publicId)
    expect(derived?.args?.[0]).toEqual([publicId])
  })
})
