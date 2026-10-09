/**
 * Cloudinary's rename and destroy default to the `upload` delivery type, so on an `authenticated`
 * asset they fail unless they pass the asset's stored type. Folder moves and privacy changes
 * rename through here, and so does the migration of assets uploaded before 1.3.0.
 */

import { v2 as cloudinary } from 'cloudinary'
import type { CloudinaryDeliveryType } from '../types.js'
import { deliveryTypeOf, type DeliveryAsset } from './deliveryURL.js'

export interface RenameTarget {
  /** The new public ID. Omit it to keep the current one. */
  publicId?: string
  /** The new delivery type. Omit it to keep the current one. */
  deliveryType?: CloudinaryDeliveryType
}

/**
 * Renames an asset, moves it to another delivery type, or both in one call, and invalidates the
 * CDN copies. Returns the asset as Cloudinary reports it after the rename.
 */
export async function renameAsset(
  asset: DeliveryAsset,
  target: RenameTarget,
): Promise<DeliveryAsset> {
  const toType = target.deliveryType ?? asset.deliveryType
  const result = await cloudinary.uploader.rename(
    asset.publicId,
    target.publicId ?? asset.publicId,
    {
      resource_type: asset.resourceType || 'image',
      type: asset.deliveryType,
      to_type: toType,
      overwrite: false,
      invalidate: true,
    },
  )

  return {
    publicId: result.public_id,
    version: typeof result.version === 'number' ? result.version : asset.version,
    resourceType: result.resource_type || asset.resourceType,
    format: result.format || asset.format,
    deliveryType: typeof result.type === 'string' ? deliveryTypeOf(result.type) : toType,
  }
}

/**
 * Moves an asset to another Cloudinary delivery type and keeps its public ID. Moving a private
 * file to `authenticated` makes its old unsigned URL stop working once the CDN copy expires.
 */
export function changeDeliveryType(
  asset: DeliveryAsset,
  deliveryType: CloudinaryDeliveryType,
): Promise<DeliveryAsset> {
  return renameAsset(asset, { deliveryType })
}
