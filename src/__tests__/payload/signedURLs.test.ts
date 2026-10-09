import { beforeAll, describe, expect, it } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { generateDownloadURL, generateSignedURL } from '../../helpers/signedURLs'
import { TEST_CLOUD } from './harness'

// The exported helpers run against the real SDK, so the URL shape and signature are real.
const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const ASSET = { publicId: 'folder/asset', version: 1700000000, format: 'png' }
const pathOf = (url: string) => url.split('?')[0]

describe('generateSignedURL', () => {
  beforeAll(() => {
    cloudinary.config(TEST_CLOUD)
  })

  it('builds a signed authenticated URL by default', () => {
    const url = generateSignedURL(ASSET)

    expect(pathOf(url)).toMatch(
      new RegExp(`^${BASE}/authenticated/s--[\\w-]{8}--/v1700000000/folder/asset\\.png$`),
    )
    expect(url).not.toContain('__cld_token__')
  })

  it('builds an unsigned URL for an asset stored as upload', () => {
    const url = generateSignedURL({ ...ASSET, deliveryType: 'upload' })

    expect(pathOf(url)).toBe(`${BASE}/upload/v1700000000/folder/asset.png`)
  })

  it('ignores expiresIn and authToken', () => {
    const plain = generateSignedURL(ASSET, { enabled: true })
    const deprecated = generateSignedURL(
      { ...ASSET, expiresIn: 60, authToken: true },
      { enabled: true, expiresIn: 60, authToken: true },
    )

    expect(deprecated).toBe(plain)
  })

  it('leaves out the transformations when includeTransformations is false', () => {
    const transformations = { width: 100, crop: 'fill' }

    const withTransformations = generateSignedURL({ ...ASSET, transformations }, { enabled: true })
    const without = generateSignedURL(
      { ...ASSET, transformations },
      { enabled: true, includeTransformations: false },
    )

    expect(pathOf(withTransformations)).toContain('/c_fill,w_100/')
    expect(without).toBe(generateSignedURL(ASSET))
  })
})

describe('generateDownloadURL', () => {
  it('builds a signed authenticated download URL', () => {
    const url = generateDownloadURL(ASSET.publicId, 'report.png', {
      version: ASSET.version,
      format: ASSET.format,
    })

    expect(pathOf(url)).toMatch(
      new RegExp(
        `^${BASE}/authenticated/s--[\\w-]{8}--/fl_attachment:report/v1700000000/folder/asset\\.png$`,
      ),
    )
  })
})
