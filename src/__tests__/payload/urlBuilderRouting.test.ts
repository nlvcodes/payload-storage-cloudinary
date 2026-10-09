import { beforeAll, describe, expect, it } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { createURLGenerator } from '../../handlers/generateURL'
import { getTransformationUrl } from '../../helpers/transformations'
import type { CloudinaryStorageOptions } from '../../types'
import { TEST_CLOUD } from './harness'

// cloudinary.url() runs for real here: it only builds and signs strings.
const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]
const SIGNED = 's--[\\w-]{8}--'

beforeAll(() => {
  cloudinary.config(TEST_CLOUD)
})

describe('getTransformationUrl', () => {
  it('keeps building an unsigned upload URL by default', () => {
    const url = getTransformationUrl({
      publicId: 'folder/asset',
      version: 1700000000,
      customTransformations: { width: 100, crop: 'fill' },
    })

    expect(pathOf(url)).toBe(`${BASE}/upload/c_fill,w_100/v1700000000/folder/asset`)
  })

  it('builds a signed authenticated URL for a private asset', () => {
    const url = getTransformationUrl({
      publicId: 'folder/asset',
      version: 1700000000,
      deliveryType: 'authenticated',
      customTransformations: { width: 100, crop: 'fill' },
    })

    expect(pathOf(url)).toMatch(
      new RegExp(`^${BASE}/authenticated/${SIGNED}/c_fill,w_100/v1700000000/folder/asset$`),
    )
    expect(url).not.toContain('__cld_token__')
  })
})

describe('generateURL', () => {
  const collection = { slug: 'media', config: {} } as any
  const generate = (
    collectionConfig: CloudinaryStorageOptions['collections'][string],
    data: Record<string, unknown>,
    filename = 'asset.png',
    prefix = '',
  ) =>
    createURLGenerator({ cloudConfig: TEST_CLOUD, collections: { media: collectionConfig } })({
      collection,
      filename,
      prefix,
      data,
    }) as string

  const stored = {
    cloudinaryPublicId: 'folder/asset',
    cloudinaryVersion: 1700000000,
    cloudinaryResourceType: 'image',
    cloudinaryFormat: 'png',
  }

  it('builds an unsigned upload URL with the version for a public record', () => {
    const url = generate(true, { ...stored, cloudinaryType: 'upload' })

    expect(pathOf(url)).toBe(`${BASE}/upload/v1700000000/folder/asset.png`)
  })

  it('signs an authenticated record even when the collection is no longer private', () => {
    const url = generate(true, { ...stored, cloudinaryType: 'authenticated' })

    expect(pathOf(url)).toMatch(
      new RegExp(`^${BASE}/authenticated/${SIGNED}/v1700000000/folder/asset\\.png$`),
    )
  })

  // generateURL has no request, so it cannot run the access rule. The afterRead hook builds
  // the URLs of a private file after the access check.
  it('returns no URL for a private record', () => {
    const legacy = generate(
      { privateFiles: true },
      {
        ...stored,
        requiresSignedURL: true,
        isPrivate: true,
        originalUrl: `${BASE}/upload/v1700000000/folder/asset.png`,
      },
    )
    const current = generate(
      { privateFiles: true },
      { ...stored, cloudinaryType: 'authenticated', requiresSignedURL: true, isPrivate: true },
    )

    expect(legacy).toBe('')
    expect(current).toBe('')
  })

  it('builds the URL from the stored fields, not from a stored Cloudinary URL', () => {
    const url = generate(true, {
      ...stored,
      cloudinaryType: 'upload',
      cloudinaryUrl: `${BASE}/upload/v1600000000/stale/asset.png`,
    })

    expect(pathOf(url)).toBe(`${BASE}/upload/v1700000000/folder/asset.png`)
  })

  it('falls back to the prefix and filename for a record with no public ID', () => {
    const url = generate(true, {}, 'photo.jpg', 'uploads')

    // The SDK adds `v1` to a versionless public ID that has a folder.
    expect(pathOf(url)).toBe(`${BASE}/upload/v1/uploads/photo`)
  })
})

// The static handler decides on the stored document, so its cases boot Payload: see
// staticHandlerAccess.test.ts.
