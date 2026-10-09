import { beforeAll, describe, expect, it } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { buildDeliveryURL, deliveryAssetOf, deliveryTypeOf } from '../../helpers/deliveryURL'
import { TEST_CLOUD } from './harness'

// cloudinary.url() runs for real here: it only builds and signs strings.
const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const ASSET = {
  publicId: 'folder/asset',
  version: 1700000000,
  resourceType: 'image',
  format: 'png',
}

const pathOf = (url: string) => url.split('?')[0]
const signatureOf = (url: string) => /\/(s--[\w-]{8}--)\//.exec(url)?.[1]

describe('buildDeliveryURL', () => {
  beforeAll(() => {
    cloudinary.config(TEST_CLOUD)
  })

  it('builds a signed authenticated URL with the version for a private asset', () => {
    const url = buildDeliveryURL({ ...ASSET, deliveryType: 'authenticated' })

    expect(pathOf(url)).toMatch(
      new RegExp(`^${BASE}/authenticated/s--[\\w-]{8}--/v1700000000/folder/asset\\.png$`),
    )
    expect(url).not.toContain('__cld_token__')
  })

  it('builds an unsigned upload URL with the version for a public asset', () => {
    const url = buildDeliveryURL({ ...ASSET, deliveryType: 'upload' })

    expect(pathOf(url)).toBe(`${BASE}/upload/v1700000000/folder/asset.png`)
  })

  it('signs the transformation, so a different transformation gets a different signature', () => {
    const asset = { ...ASSET, deliveryType: 'authenticated' as const }
    const plain = buildDeliveryURL(asset)
    const resized = buildDeliveryURL(asset, { transformation: { width: 100, crop: 'fill' } })

    expect(pathOf(resized)).toMatch(
      new RegExp(
        `^${BASE}/authenticated/s--[\\w-]{8}--/c_fill,w_100/v1700000000/folder/asset\\.png$`,
      ),
    )
    expect(signatureOf(resized)).not.toBe(signatureOf(plain))
  })

  it('uses the resource type of the asset', () => {
    const url = buildDeliveryURL({
      ...ASSET,
      resourceType: 'video',
      format: 'mp4',
      deliveryType: 'upload',
    })

    expect(pathOf(url)).toBe(
      `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/video/upload/v1700000000/folder/asset.mp4`,
    )
  })

  it('adds the attachment flag for a download', () => {
    const url = buildDeliveryURL(
      { ...ASSET, deliveryType: 'authenticated' },
      { attachment: 'Report 2024.final.pdf' },
    )

    expect(pathOf(url)).toMatch(
      new RegExp(
        `^${BASE}/authenticated/s--[\\w-]{8}--/fl_attachment:Report_2024_final/v1700000000/folder/asset\\.png$`,
      ),
    )
  })
})

describe('deliveryTypeOf', () => {
  it.each([
    ['authenticated', 'authenticated'],
    ['upload', 'upload'],
    [undefined, 'upload'],
    [null, 'upload'],
  ])('reads %s as %s', (value, expected) => {
    expect(deliveryTypeOf(value)).toBe(expected)
  })
})

describe('deliveryAssetOf', () => {
  const stored = {
    cloudinaryPublicId: 'folder/asset',
    cloudinaryVersion: 1700000000,
    cloudinaryResourceType: 'image',
    cloudinaryFormat: 'png',
  }

  it('reads the asset from the stored fields', () => {
    expect(deliveryAssetOf({ ...stored, cloudinaryType: 'upload' })).toEqual({
      publicId: 'folder/asset',
      version: 1700000000,
      resourceType: 'image',
      format: 'png',
      deliveryType: 'upload',
    })
  })

  it('prefers the stored type over the stored URLs', () => {
    const doc = {
      ...stored,
      cloudinaryType: 'authenticated',
      originalUrl: 'https://res.cloudinary.com/c/image/upload/v1700000000/folder/asset.png',
    }

    expect(deliveryAssetOf(doc).deliveryType).toBe('authenticated')
  })

  it.each([
    ['upload', 'https://res.cloudinary.com/c/image/upload/v1700000000/folder/asset.png'],
    [
      'authenticated',
      'https://res.cloudinary.com/c/image/authenticated/s--abcdefgh--/v1700000000/folder/asset.png',
    ],
  ])('reads a legacy record with no type as %s from its stored original URL', (type, url) => {
    expect(deliveryAssetOf({ ...stored, isPrivate: true, originalUrl: url }).deliveryType).toBe(
      type,
    )
  })

  it('falls back to the stored Cloudinary URL when there is no original URL', () => {
    const doc = {
      ...stored,
      isPrivate: true,
      cloudinaryUrl: 'https://res.cloudinary.com/c/image/upload/v1700000000/folder/asset.png',
    }

    expect(deliveryAssetOf(doc).deliveryType).toBe('upload')
  })

  it.each([
    [{ isPrivate: true }, 'authenticated'],
    [{ requiresSignedURL: true }, 'authenticated'],
    [{ isPrivate: false }, 'upload'],
    [{}, 'upload'],
  ])('reads a record with no type and no URL, %o, as %s', (flags, type) => {
    expect(deliveryAssetOf({ ...stored, ...flags }).deliveryType).toBe(type)
  })
})
