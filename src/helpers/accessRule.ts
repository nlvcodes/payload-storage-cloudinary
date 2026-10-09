import type { Payload } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'
import {
  fieldNamesOf,
  getSignedURLConfig,
  getTransformationConfig,
  normalizeCollectionConfig,
} from './normalizeConfig.js'

/**
 * What a reader may get for a document's file:
 * - `original`: the file itself, with any transformation.
 * - `preview`: only the watermarked or blurred preview.
 * - `none`: no URL at all.
 */
export type FileAccess = 'original' | 'preview' | 'none'

/**
 * The one access rule for private files. Every path that hands out a file URL asks it first.
 *
 * The caller must have fetched `doc` with the collection's `read` access enforced
 * (`overrideAccess: false`). A reader who fails `read` never reaches this function.
 *
 * `customAuthCheck` can read any field, so `doc` must be the whole document as stored, read with
 * readStoredDocument() (storedDocument.ts). A read projected by `select` or `populate`, or one
 * that field `read` access trims, can leave out the very field the check reads. The afterRead
 * hook, the signed-URL endpoints and the server helpers all pass the stored row as a read with
 * every field visible shows it, so the check sees one shape everywhere: every field, localized
 * fields in one locale, relationship fields as IDs. On a localized site the check runs once per
 * locale (see resolveViewsAccess).
 *
 * The original needs `customAuthCheck` to pass. With no `customAuthCheck`, the original goes to
 * every reader, except on a `publicTransformation` collection, where nobody gets it. A reader
 * who is refused the original gets the preview, if the document has one.
 */
export async function resolveFileAccess(
  req: any,
  doc: any,
  collectionConfig: CloudinaryCollectionConfig,
): Promise<FileAccess> {
  const config = normalizeCollectionConfig(collectionConfig)
  const customAuthCheck = getSignedURLConfig(config)?.customAuthCheck
  const transformConfig = getTransformationConfig(config)
  const publicTransformation = transformConfig.publicTransformation

  if (customAuthCheck) {
    if (await customAuthCheck(req, doc)) return 'original'
  } else if (!publicTransformation?.enabled) {
    return 'original'
  }

  const previewField = fieldNamesOf(transformConfig).hasPublicTransformation
  return publicTransformation?.enabled && doc?.[previewField] === true ? 'preview' : 'none'
}

const RANK: Record<FileAccess, number> = { none: 0, preview: 1, original: 2 }

/**
 * The access rule over every view of a stored document (see StoredRead in storedDocument.ts):
 * what the most restrictive view allows. A localized site has one view per locale, whatever
 * locale the reader asked for, and a version read adds the document's own views, so each one has
 * to allow what the reader gets.
 * With no view, the reader gets nothing.
 */
export async function resolveViewsAccess(
  req: any,
  views: readonly any[],
  collectionConfig: CloudinaryCollectionConfig,
): Promise<FileAccess> {
  let access: FileAccess | undefined
  for (const view of views) {
    const decided = await resolveFileAccess(req, view, collectionConfig)
    if (access === undefined || RANK[decided] < RANK[access]) access = decided
    if (access === 'none') break
  }
  return access ?? 'none'
}

/**
 * Whether the access rule gives this reader the original file. Same contract as
 * resolveFileAccess(): `doc` must come from a lookup with `read` access enforced.
 */
export async function mayGetOriginal(
  req: any,
  doc: any,
  collectionConfig: CloudinaryCollectionConfig,
): Promise<boolean> {
  return (await resolveFileAccess(req, doc, collectionConfig)) === 'original'
}

/** Where the plugin records each collection's config, under the collection's server-only `custom`. */
export const PLUGIN_CONFIG_KEY = 'cloudinaryStorage'

/**
 * The plugin config a collection was installed with, as recorded by the plugin. The helpers read
 * it from here, never from the caller, so a caller can't drop `customAuthCheck` or
 * `publicTransformation` by leaving out an argument.
 */
export function pluginConfigOf(payload: Payload, collection: string): CloudinaryCollectionConfig {
  return payload.collections[collection]?.config.custom?.[PLUGIN_CONFIG_KEY] ?? {}
}
