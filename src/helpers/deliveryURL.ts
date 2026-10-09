/**
 * The one place that builds Cloudinary delivery URLs. Every handler, hook, endpoint and exported
 * helper that hands out a delivery URL builds it through `buildDeliveryURL`, so they all agree on
 * delivery type and signing.
 *
 * A private asset is an `authenticated` asset, delivered through a signed URL. The signature
 * covers the transformation and the public ID, so editing the URL breaks it. Cloudinary signed
 * URLs do not expire: treat every URL built here as a bearer link.
 *
 * The URL never carries `auth_token`. When a token is present, the SDK leaves out the
 * signature, and token authentication needs a Cloudinary plan feature this plugin doesn't use.
 */

import { v2 as cloudinary } from 'cloudinary'
import type { CloudinaryDeliveryType } from '../types.js'

export interface DeliveryAsset {
  publicId: string
  /** Part of the delivered path. Always pass it when the document has one. */
  version?: number
  resourceType?: string
  format?: string
  deliveryType: CloudinaryDeliveryType
}

/** The 150x150 thumbnail the admin UI shows. */
export const THUMBNAIL_TRANSFORMATION = {
  width: 150,
  height: 150,
  crop: 'fill',
  gravity: 'auto',
  quality: 'auto',
  fetch_format: 'auto',
}

export interface DeliveryURLOptions {
  transformation?: Record<string, any> | Record<string, any>[]
  /** Deliver the asset as a download, saved under this filename. */
  attachment?: string
}

export function buildDeliveryURL(asset: DeliveryAsset, options: DeliveryURLOptions = {}): string {
  const isPrivate = asset.deliveryType === 'authenticated'
  const urlOptions: Record<string, any> = {
    secure: true,
    type: asset.deliveryType,
    resource_type: asset.resourceType || 'image',
  }

  if (isPrivate) urlOptions.sign_url = true
  if (asset.version) urlOptions.version = asset.version
  if (asset.format) urlOptions.format = asset.format
  if (options.transformation) urlOptions.transformation = options.transformation
  if (options.attachment) urlOptions.flags = `attachment:${attachmentName(options.attachment)}`

  return cloudinary.url(asset.publicId, urlOptions)
}

/** Reads a stored or returned Cloudinary type. Anything but `authenticated` delivers as `upload`. */
export function deliveryTypeOf(value: unknown): CloudinaryDeliveryType {
  return value === 'authenticated' ? 'authenticated' : 'upload'
}

/**
 * Every field in which a version of this plugin stored a delivery URL. A private file stores none
 * of them, and migratePrivateAssets clears them from a legacy private row. Keep a field here after
 * the schema drops it: a row from an older version can still hold it.
 */
export const STORED_URL_FIELDS = [
  'url',
  'thumbnailURL',
  'cloudinaryUrl',
  'originalUrl',
  'transformedUrl',
  'previewUrl',
  'publicTransformationUrl',
] as const

/** The stored fields of a document that the URL builder reads. */
export interface StoredCloudinaryFields {
  cloudinaryPublicId?: unknown
  cloudinaryVersion?: unknown
  cloudinaryResourceType?: unknown
  cloudinaryFormat?: unknown
  cloudinaryType?: unknown
  originalUrl?: unknown
  cloudinaryUrl?: unknown
  isPrivate?: unknown
  requiresSignedURL?: unknown
}

/**
 * Reads the asset to deliver from a document's stored fields.
 *
 * A record from before 1.3.0 has no `cloudinaryType`. Its type comes from the delivery-type
 * segment of its stored original URL, then its stored Cloudinary URL. With neither, a private
 * record is `authenticated`, where the plugin uploaded private files without publicTransformation.
 */
export function deliveryAssetOf(
  doc: StoredCloudinaryFields | Record<string, unknown>,
): DeliveryAsset {
  return {
    publicId: String(doc.cloudinaryPublicId ?? ''),
    version: typeof doc.cloudinaryVersion === 'number' ? doc.cloudinaryVersion : undefined,
    resourceType:
      typeof doc.cloudinaryResourceType === 'string' ? doc.cloudinaryResourceType : undefined,
    format: typeof doc.cloudinaryFormat === 'string' ? doc.cloudinaryFormat : undefined,
    deliveryType: storedDeliveryType(doc),
  }
}

/** The stored fields that record an asset, after a move: the inverse of deliveryAssetOf. */
export type StoredAssetFields = {
  cloudinaryPublicId: string
  cloudinaryVersion: number | undefined
  cloudinaryType: CloudinaryDeliveryType
}

/**
 * The stored fields to write for an asset. A move changes only the public ID, the version and the
 * delivery type, so the resource type and the format stay as stored.
 */
export function assetFieldsOf(asset: DeliveryAsset): StoredAssetFields {
  return {
    cloudinaryPublicId: asset.publicId,
    cloudinaryVersion: asset.version,
    cloudinaryType: asset.deliveryType,
  }
}

/**
 * Whether a document is a private file: marked private, marked as needing a signed URL, or stored
 * as an `authenticated` asset. Every check that gates a URL on privacy uses this one.
 */
export function isPrivateFile(doc: StoredCloudinaryFields | Record<string, unknown>): boolean {
  return (
    doc.isPrivate === true ||
    doc.requiresSignedURL === true ||
    storedDeliveryType(doc) === 'authenticated'
  )
}

function storedDeliveryType(doc: StoredCloudinaryFields): CloudinaryDeliveryType {
  if (doc.cloudinaryType === 'upload' || doc.cloudinaryType === 'authenticated') {
    return doc.cloudinaryType
  }
  return (
    storedURLDeliveryType(doc) ??
    (doc.isPrivate === true || doc.requiresSignedURL === true ? 'authenticated' : 'upload')
  )
}

/**
 * The delivery type in the stored original URL, then the stored Cloudinary URL, of a record from
 * before 1.3.0. Field access strips both URLs from a read, so read them before it runs.
 */
export function storedURLDeliveryType(
  doc: StoredCloudinaryFields,
): CloudinaryDeliveryType | undefined {
  for (const url of [doc.originalUrl, doc.cloudinaryUrl]) {
    const type = typeof url === 'string' ? DELIVERY_TYPE_SEGMENT.exec(url)?.[1] : undefined
    if (type) return deliveryTypeOf(type)
  }
  return undefined
}

// The `/<resource type>/<delivery type>/` segment of a Cloudinary delivery URL.
const DELIVERY_TYPE_SEGMENT = /\/(?:image|video|raw)\/(upload|authenticated)\//

// fl_attachment takes a filename without its extension, and only URL-safe characters.
function attachmentName(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.substring(0, dot) : filename
  return stem.replace(/[^a-zA-Z0-9_-]/g, '_')
}
