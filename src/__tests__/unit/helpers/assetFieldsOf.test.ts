import { describe, expect, it } from 'vitest'
import { assetFieldsOf, deliveryAssetOf } from '../../../helpers/deliveryURL'

describe('assetFieldsOf', () => {
  it('maps an asset to the stored fields that record it', () => {
    const fields = assetFieldsOf({
      publicId: 'originals/photo',
      version: 1690000000,
      resourceType: 'image',
      format: 'png',
      deliveryType: 'authenticated',
    })

    // The resource type and format don't change when an asset moves, so no move writes them
    expect(fields).toEqual({
      cloudinaryPublicId: 'originals/photo',
      cloudinaryVersion: 1690000000,
      cloudinaryType: 'authenticated',
    })
  })

  it('writes an asset with no version as an undefined version', () => {
    const fields = assetFieldsOf({ publicId: 'originals/photo', deliveryType: 'upload' })

    expect(Object.hasOwn(fields, 'cloudinaryVersion')).toBe(true)
    expect(fields.cloudinaryVersion).toBeUndefined()
  })

  it('is the inverse of deliveryAssetOf for the fields it writes', () => {
    const asset = { publicId: 'folder/photo', version: 1700000000, deliveryType: 'upload' as const }

    expect(deliveryAssetOf(assetFieldsOf(asset))).toEqual({
      ...asset,
      resourceType: undefined,
      format: undefined,
    })
  })
})
