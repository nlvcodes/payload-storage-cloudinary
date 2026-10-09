/**
 * Signed URL Helper Functions
 *
 * SECURITY MODEL:
 * 1. Payload's Local API skips access control unless the call passes `overrideAccess: false`,
 *    even when it passes `req`. Every lookup that leads to a URL must pass both.
 * 2. With `overrideAccess: false`, Payload runs the collection's `read` access. A denial throws
 *    Forbidden (403), and a document outside a query-based `read` throws NotFound (404).
 * 3. resolveFileAccess() in accessRule.ts then decides what the reader gets: the original,
 *    the preview only, or nothing. isAccessAllowed() is true only for the original, decided on
 *    the document it is given. isAccessAllowedByID() in serverHelpers.ts decides on the stored
 *    document in every locale, as the plugin does.
 */

import type {
  CloudinaryCollectionConfig,
  CloudinaryDeliveryType,
  SignedURLConfig,
} from '../types.js'
import { buildDeliveryURL } from './deliveryURL.js'
import { mayGetOriginal } from './accessRule.js'

export interface SignedURLOptions {
  publicId: string
  version?: number
  resourceType?: string
  format?: string
  transformations?: Record<string, any>
  /** The asset's stored Cloudinary type. Defaults to `authenticated`, where private originals live. */
  deliveryType?: CloudinaryDeliveryType
  /** @deprecated Ignored. Cloudinary signed URLs don't expire. */
  expiresIn?: number
  /** @deprecated Ignored. The URL is signed, never token-authenticated. */
  authToken?: boolean
  attachmentFilename?: string
}

/**
 * Builds a signed delivery URL for a private file. The URL doesn't expire, so treat it as a
 * bearer link. Routes through the URL builder, so it never carries an auth token.
 *
 * A primitive: it signs any public ID and any transformations, with no access check and no
 * allowlist. Only trusted server code may call it, and never with a public ID or transformations
 * taken from a request. To serve a reader, use `getSignedURL` or the signed-URL endpoints, which
 * apply the access rule and the transformation allowlist.
 */
export function generateSignedURL(options: SignedURLOptions, config?: SignedURLConfig): string {
  const {
    publicId,
    version,
    resourceType,
    format,
    transformations,
    deliveryType = 'authenticated',
    attachmentFilename,
  } = options

  return buildDeliveryURL(
    { publicId, version, resourceType, format, deliveryType },
    {
      transformation:
        transformations && config?.includeTransformations !== false ? transformations : undefined,
      attachment: attachmentFilename,
    },
  )
}

export function generatePrivateUploadOptions(config: SignedURLConfig): Record<string, any> {
  const options: Record<string, any> = {
    type: 'authenticated',
    access_mode: 'authenticated',
  }

  // Add auth types if specified
  if (config.authTypes && config.authTypes.length > 0) {
    options.access_type = config.authTypes.join(',')
  }

  return options
}

/**
 * Builds a delivery URL that downloads the file under `filename`. Defaults to `authenticated`,
 * where private originals live, so the URL is signed and is a bearer link.
 *
 * A primitive, like `generateSignedURL`: it signs any public ID with no access check. Only trusted
 * server code may call it, and never with a public ID taken from a request.
 */
export function generateDownloadURL(
  publicId: string,
  filename: string,
  options?: {
    /** @deprecated Ignored. Cloudinary signed URLs don't expire. */
    expiresIn?: number
    resourceType?: string
    version?: number
    format?: string
    deliveryType?: CloudinaryDeliveryType
  },
): string {
  return buildDeliveryURL(
    {
      publicId,
      version: options?.version,
      resourceType: options?.resourceType,
      format: options?.format,
      deliveryType: options?.deliveryType ?? 'authenticated',
    },
    { attachment: filename },
  )
}

/**
 * Whether the reader may get the original file, decided on the document you pass.
 *
 * @deprecated Use `isAccessAllowedByID({ req, collection, id })`, which decides exactly as the
 * plugin does. This form decides only on the document given, in the one locale it holds, and
 * logs a deprecation warning the first time it runs. Never pass it a raw database row, such as
 * one from `payload.db.findOne`, on a collection with localized fields: the row holds each
 * localized field keyed by locale (`{ en: true }`), so a check such as `doc.locked !== true`
 * passes for every reader.
 *
 * Pass the collection's plugin config, so the check knows about `publicTransformation`. The
 * document must come from a lookup with the collection's `read` access enforced, and must be the
 * whole document as stored, since `customAuthCheck` can read any field.
 *
 * The 1.2.x call shape, a bare SignedURLConfig or no config, can't tell whether the collection
 * uses `publicTransformation`, so it fails closed: it returns the config's `customAuthCheck`
 * answer, and `false` when there is none.
 */
export async function isAccessAllowed(
  req: any,
  doc: any,
  config?: SignedURLConfig | CloudinaryCollectionConfig,
): Promise<boolean> {
  warnDocFormOnce()
  if (!isCollectionConfig(config)) {
    warnBareConfigOnce()
    const customAuthCheck = config?.customAuthCheck
    return customAuthCheck ? Boolean(await customAuthCheck(req, doc)) : false
  }
  return mayGetOriginal(req, doc, config)
}

// Keys only a collection's plugin config has. `{}` is the config of a collection installed with
// `true`, so an object with no SignedURLConfig key counts as a collection config too.
const COLLECTION_CONFIG_KEYS = ['privateFiles', 'signedURLs', 'transformations']
const SIGNED_URL_CONFIG_KEYS = [
  'enabled',
  'customAuthCheck',
  'expiresIn',
  'authToken',
  'authTypes',
  'includeTransformations',
]

function isCollectionConfig(
  config?: SignedURLConfig | CloudinaryCollectionConfig,
): config is CloudinaryCollectionConfig {
  if (!config || typeof config !== 'object') return false
  if (COLLECTION_CONFIG_KEYS.some((key) => key in config)) return true
  return !SIGNED_URL_CONFIG_KEYS.some((key) => key in config)
}

let warnedDocForm = false

function warnDocFormOnce(): void {
  if (warnedDocForm) return
  warnedDocForm = true
  console.warn(
    '[payload-storage-cloudinary] isAccessAllowed(req, doc, config) is deprecated. It decides ' +
      'only on the document you pass, so a raw database row on a localized collection lets ' +
      'readers through. Use isAccessAllowedByID({ req, collection, id }), which decides the ' +
      'way the plugin does, in every locale.',
  )
}

let warnedBareConfig = false

function warnBareConfigOnce(): void {
  if (warnedBareConfig) return
  warnedBareConfig = true
  console.warn(
    '[payload-storage-cloudinary] isAccessAllowed was called with a bare SignedURLConfig or ' +
      "no config. This call shape is deprecated: pass the collection's plugin config instead. " +
      'Until you do, it returns the customAuthCheck answer, and false when there is no ' +
      'customAuthCheck.',
  )
}
