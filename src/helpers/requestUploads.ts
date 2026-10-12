import type { PayloadRequest } from 'payload'
import type { CloudinaryDeliveryType } from '../types.js'
import { deliveryTypeOf } from './deliveryURL.js'

/**
 * What this request uploaded to, or is about to remove from, Cloudinary, kept on `req.context`.
 *
 * Payload v4 deletes stored files by storage key alone (`deleteFile({ storageFilePath })`): to
 * roll back a failed upload, after a document is deleted, and after a replacement. Cloudinary
 * addresses assets by public ID, so the plugin records which asset each key is:
 *
 * - an upload records the exact key `handleUpload` received (rollback);
 * - a deleted document, or the previous document of an update, records its file by
 *   `<_objectKey>/<filename>`. Every v4 file sits in its own random `_objectKey` folder, so that
 *   suffix identifies the key whatever the prefixes. A row from before Payload v4 has no
 *   `_objectKey`, and Payload keys its file by `<prefix>/<filename>`, so it records that.
 *
 * It also lets the delete paths skip a public ID this request just uploaded: with `useFilename`,
 * replacing `logo.jpg` with `logo.png` uploads to the same public ID that the cleanup then
 * targets.
 */
export interface UploadedAsset {
  publicId: string
  resourceType: string
  deliveryType: CloudinaryDeliveryType
}

export type RecordedAsset = UploadedAsset & {
  /** `upload`: written by this request; `document`: belongs to a deleted or replaced document. */
  source: 'upload' | 'document'
}

interface RequestUploads {
  publicIds: Set<string>
  byStorageKey: Map<string, UploadedAsset>
  /** Keyed by `<_objectKey>/<filename>`, or `<prefix>/<filename>` for a row from before v4. */
  byObjectPath: Map<string, UploadedAsset>
  /** Public IDs this request destroyed, so no other delete path destroys them again. */
  destroyed: Set<string>
}

const CONTEXT_KEY = 'cloudinaryRequestUploads'

const uploadsOf = (req: PayloadRequest): RequestUploads => {
  req.context = req.context || {}
  const existing = req.context[CONTEXT_KEY] as RequestUploads | undefined
  if (existing) return existing
  const created: RequestUploads = {
    publicIds: new Set(),
    byStorageKey: new Map(),
    byObjectPath: new Map(),
    destroyed: new Set(),
  }
  req.context[CONTEXT_KEY] = created
  return created
}

const existingUploads = (req: PayloadRequest | undefined) =>
  req?.context?.[CONTEXT_KEY] as RequestUploads | undefined

export const recordUpload = (
  req: PayloadRequest | undefined,
  asset: UploadedAsset,
  storageFilePath?: string,
) => {
  if (!req) return
  const uploads = uploadsOf(req)
  uploads.publicIds.add(asset.publicId)
  if (storageFilePath) uploads.byStorageKey.set(storageFilePath, asset)
}

/** Records the Cloudinary asset of a document whose stored file Payload may now delete by key. */
export const recordDocumentAsset = (
  req: PayloadRequest | undefined,
  doc: Record<string, unknown> | undefined,
) => {
  if (!req || !doc || typeof doc.cloudinaryPublicId !== 'string' || !doc.cloudinaryPublicId) {
    return
  }
  const asset: UploadedAsset = {
    publicId: doc.cloudinaryPublicId,
    resourceType:
      typeof doc.cloudinaryResourceType === 'string' ? doc.cloudinaryResourceType : 'image',
    deliveryType: deliveryTypeOf(doc.cloudinaryType),
  }
  const uploads = uploadsOf(req)
  const original = doc.original as Record<string, unknown> | undefined
  const representations: Array<Record<string, unknown> | undefined> = [doc, original]
  for (const representation of representations) {
    const objectKey = representation?._objectKey
    const filename = representation?.filename
    if (typeof filename !== 'string' || !filename) continue
    if (typeof objectKey === 'string' && objectKey) {
      uploads.byObjectPath.set(`${objectKey}/${filename}`, asset)
    } else {
      // A file from before Payload v4, keyed by its prefix and filename
      const rawPrefix = representation?.prefix ?? doc.prefix
      const prefix = typeof rawPrefix === 'string' ? rawPrefix.replace(/^\/+|\/+$/g, '') : ''
      uploads.byObjectPath.set(prefix ? `${prefix}/${filename}` : filename, asset)
    }
  }
}

/**
 * A row written before Payload v4: no `_objectKey` folder on its file. Payload reads such a row
 * with an `original` group it builds from the row's own fields, so that group has none either.
 */
export const isPreV4Row = (doc: Record<string, unknown>) => {
  const original = doc.original as Record<string, unknown> | null | undefined
  return !doc._objectKey && !original?._objectKey
}

export const markDestroyed = (req: PayloadRequest | undefined, publicId: string) => {
  if (req) uploadsOf(req).destroyed.add(publicId)
}

export const wasDestroyed = (req: PayloadRequest | undefined, publicId: string) =>
  Boolean(existingUploads(req)?.destroyed.has(publicId))

export const wasUploadedInRequest = (req: PayloadRequest | undefined, publicId: string) =>
  Boolean(existingUploads(req)?.publicIds.has(publicId))

export const recordedAssetFor = (
  req: PayloadRequest | undefined,
  storageFilePath: string,
): RecordedAsset | undefined => {
  const uploads = existingUploads(req)
  if (!uploads) return undefined
  const uploaded = uploads.byStorageKey.get(storageFilePath)
  if (uploaded) return { ...uploaded, source: 'upload' }
  for (const [objectPath, asset] of uploads.byObjectPath) {
    if (storageFilePath === objectPath || storageFilePath.endsWith(`/${objectPath}`)) {
      return { ...asset, source: 'document' }
    }
  }
  return undefined
}

const UPDATE_TARGETS_KEY = 'cloudinaryUpdateTargets'

/**
 * Records the document an `updateByID` on `collection` targets, or clears it for a create or a
 * bulk update. Payload v4 stages a replacement file before the document hooks run and hands
 * `handleUpload` only the request's data, so the handler reads the document's stored privacy
 * and folder through this ID.
 */
export const recordUpdateTarget = (
  req: PayloadRequest | undefined,
  collection: string,
  id: number | string | undefined,
) => {
  if (!req) return
  req.context = req.context || {}
  const targets = (req.context[UPDATE_TARGETS_KEY] ??= {}) as Record<string, number | string>
  if (id === undefined) delete targets[collection]
  else targets[collection] = id
}

export const updateTargetOf = (req: PayloadRequest | undefined, collection: string) =>
  (req?.context?.[UPDATE_TARGETS_KEY] as Record<string, number | string> | undefined)?.[collection]
