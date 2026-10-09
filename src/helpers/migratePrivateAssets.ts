/**
 * Moves the private files a site uploaded before 1.3.0 to the state 1.3.0 expects: every private
 * original an `authenticated` asset, its type recorded in `cloudinaryType`, and no delivery URL
 * stored. A site owner calls it from a Payload migration, once per Cloudinary collection.
 */

import { v2 as cloudinary } from 'cloudinary'
import type { Payload, PayloadRequest } from 'payload'
import type { CloudinaryDeliveryType } from '../types.js'
import { pluginConfigOf } from './accessRule.js'
import {
  assetFieldsOf,
  deliveryAssetOf,
  isPrivateFile,
  STORED_URL_FIELDS,
  type DeliveryAsset,
} from './deliveryURL.js'
import { messageOf } from './errorMessage.js'
import { fieldNamesOf, getTransformationConfig } from './normalizeConfig.js'
import { changeDeliveryType } from './renameAsset.js'
import { writeStoredRow, writeVersionRow, type VersionRow } from './storedRows.js'

export interface MigratePrivateAssetsArgs {
  payload: Payload
  /**
   * The migration's request. Every read and write joins its transaction, through the database
   * adapter, so no collection hook, validation or access check runs. Only a database error can
   * still roll the transaction back, so the first database error inside a transaction stops the
   * run with a `MigrationStoppedError`.
   */
  req: PayloadRequest
  collection: string
  /** Report what the migration would change, and change nothing. */
  dryRun?: boolean
}

/** A document the migration looked at. */
export interface DocumentRef {
  id: number | string
  /** The Cloudinary public ID of the document's file. */
  publicId: string
}

/** A public copy that versions before 1.3.0 uploaded beside a private original. */
export interface PublicCopy {
  /** The document whose original the copy was made from. */
  id: number | string
  /** The Cloudinary public ID of the copy, not of the document's file. */
  publicId: string
}

export interface MigrationReport {
  /** The documents migrated, or with `dryRun`, the documents the migration would migrate. */
  changed: DocumentRef[]
  /** The documents that need no change: public files, and private files already migrated. */
  skipped: DocumentRef[]
  /** The documents the migration could not migrate. A later run retries them. */
  failed: FailedDocument[]
  /**
   * The public watermarked or blurred copies that versions before 1.3.0 uploaded beside a
   * private original on a `publicTransformation` collection. Each is a public `upload` asset.
   * The migration leaves them in place: deleting them is the site owner's call.
   */
  publicCopies: PublicCopy[]
}

export interface FailedDocument extends DocumentRef {
  error: string
}

/**
 * Thrown when a database write fails inside the caller's transaction. On Postgres one failed
 * statement aborts the transaction, so every later write would fail too, and the caller's
 * migration rolls it back. The run stops at the first one instead.
 */
export class MigrationStoppedError extends Error {
  /**
   * What the run did before it stopped. The rollback undoes the database writes of every
   * document in `changed`, but not their Cloudinary renames.
   */
  readonly report: MigrationReport

  constructor(report: MigrationReport, writeError: unknown) {
    super(
      `A database write failed inside the migration's transaction (${messageOf(writeError)}), ` +
        `so the migration stopped. The database rolls back every write this run made, but the ` +
        `Cloudinary renames stay. Run the migration again: it finds those documents through an ` +
        `Admin API lookup and migrates them.`,
      { cause: writeError },
    )
    this.name = 'MigrationStoppedError'
    this.report = report
  }
}

// A database write that failed inside the caller's transaction, which the run can't go past.
class WriteFailedInTransaction extends Error {
  constructor(readonly writeError: unknown) {
    super(messageOf(writeError))
  }
}

const PAGE_SIZE = 100

export async function migratePrivateAssets({
  payload,
  req,
  collection,
  dryRun = false,
}: MigratePrivateAssetsArgs): Promise<MigrationReport> {
  const report: MigrationReport = { changed: [], skipped: [], failed: [], publicCopies: [] }
  const urlFields = storedURLFieldsOf(payload, collection)
  const publicCopyOf = publicCopyNamer(payload, collection)

  for await (const row of storedRows(payload, req, collection)) {
    const document = { id: row.id, publicId: String(row.cloudinaryPublicId) }
    for (const publicId of publicCopyOf(row)) report.publicCopies.push({ id: row.id, publicId })

    if (!needsMigration(row, urlFields)) {
      report.skipped.push(document)
      continue
    }
    if (!dryRun) {
      try {
        await migrateDocument({ payload, req, collection, row, urlFields })
      } catch (error) {
        const stops = error instanceof WriteFailedInTransaction
        const failure = stops ? error.writeError : error
        const message = messageOf(failure)
        payload.logger.error({
          msg: 'Failed to migrate a private Cloudinary file',
          collection,
          id: row.id,
          cloudinaryPublicId: document.publicId,
          error: message,
        })
        report.failed.push({ ...document, error: message })
        if (stops) throw new MigrationStoppedError(report, failure)
        continue
      }
    }
    report.changed.push(document)
  }

  return report
}

/**
 * Moves one document's asset to `authenticated` when it is not, then records the type and
 * clears the stored URLs, in its version rows first and its own row last. A later run reads only
 * the document's row, so it finds the document again until every write has gone through. When a
 * write fails, the version rows already written go back to what they held and, when this run
 * renamed the asset, it moves back to its old type, so the rows and the asset agree. Inside the
 * caller's transaction the rollback puts the rows back, so only the asset moves back, and the run
 * stops.
 *
 * The writes go through the database adapter, not the Local API. Payload rolls back the
 * caller's transaction when any Local API operation fails, so one document refused by a hook,
 * validation or access would undo every write before it while their renames stayed. The adapter
 * runs no hook, validation or access check, so only a database error can roll it back.
 */
async function migrateDocument({
  payload,
  req,
  collection,
  row,
  urlFields,
}: {
  payload: Payload
  req: PayloadRequest
  collection: string
  row: Record<string, any>
  urlFields: string[]
}): Promise<void> {
  const stored = deliveryAssetOf(row)
  const versions = await storedVersions(payload, req, collection, row.id)
  const { asset, renamed } =
    stored.deliveryType === 'authenticated'
      ? { asset: stored, renamed: false }
      : await moveToAuthenticated(stored)
  const clearedURLs = Object.fromEntries(urlFields.map((field) => [field, null]))
  const assetFields = assetFieldsOf(asset)

  const written: VersionRow[] = []
  try {
    for (const versionRow of versions) {
      // A version of an asset since replaced keeps its asset, and records the type its own
      // stored URLs show before they are cleared, so the read path doesn't misread it.
      const sameAsset = versionRow.version?.cloudinaryPublicId === stored.publicId
      await writeVersionRow(payload, req, collection, versionRow, {
        ...versionRow.version,
        ...clearedURLs,
        ...(sameAsset
          ? assetFields
          : { cloudinaryType: deliveryAssetOf(versionRow.version).deliveryType }),
      })
      written.push(versionRow)
    }
    await writeStoredRow(payload, req, collection, row.id, { ...assetFields, ...clearedURLs })
  } catch (error) {
    if (req.transactionID) {
      // The rollback puts back every row this run wrote, so only the asset needs moving back.
      if (renamed) await moveBackBeforeRollback(payload, asset, stored)
      throw new WriteFailedInTransaction(error)
    }
    await restoreDocument({ payload, req, collection, written, asset, renamed, stored, error })
    throw error
  }
}

/**
 * Moves an asset this run renamed back to its stored type, before the caller's transaction rolls
 * the document back. When that fails, a rerun finds the asset through the Admin API lookup.
 */
async function moveBackBeforeRollback(
  payload: Payload,
  asset: DeliveryAsset,
  stored: DeliveryAsset,
): Promise<void> {
  try {
    await changeDeliveryType(asset, stored.deliveryType)
  } catch (undoError) {
    payload.logger.warn({
      msg: 'Failed to move a Cloudinary asset back. A rerun of the migration recovers it.',
      cloudinaryPublicId: asset.publicId,
      error: messageOf(undoError),
    })
  }
}

/** The asset after the move to `authenticated`, and whether this run renamed it. */
interface MovedAsset {
  asset: DeliveryAsset
  /** False when the asset was already `authenticated`, so nothing may move it back. */
  renamed: boolean
}

/**
 * Moves an asset to `authenticated`. When the rename fails, the asset may already be there: a
 * run whose database writes were rolled back keeps its renames. An Admin API lookup tells, and a
 * second one checks that no `upload` asset under the same public ID still serves. The document
 * then migrates as if this run had renamed it.
 */
async function moveToAuthenticated(stored: DeliveryAsset): Promise<MovedAsset> {
  try {
    return { asset: await changeDeliveryType(stored, 'authenticated'), renamed: true }
  } catch (renameError) {
    let authenticatedAsset: Record<string, any> | undefined
    try {
      authenticatedAsset = await findAsset(stored, 'authenticated')
    } catch (lookupError) {
      throw new Error(
        `${messageOf(renameError)}. Looking the asset up as authenticated failed too ` +
          `(${messageOf(lookupError)}).`,
      )
    }
    if (!authenticatedAsset) throw renameError

    let uploadAsset: Record<string, any> | undefined
    try {
      uploadAsset = await findAsset(stored, 'upload')
    } catch (lookupError) {
      throw new Error(
        `${messageOf(renameError)}. Looking the asset up as upload failed too ` +
          `(${messageOf(lookupError)}).`,
      )
    }
    if (uploadAsset) {
      throw new Error(
        `${messageOf(renameError)}. An upload asset and an authenticated asset share the public ` +
          `ID ${stored.publicId}, and the public one still serves. Delete the one you don't ` +
          `need in Cloudinary, then run the migration again.`,
      )
    }
    return {
      asset: {
        ...stored,
        version:
          typeof authenticatedAsset.version === 'number'
            ? authenticatedAsset.version
            : stored.version,
        deliveryType: 'authenticated',
      },
      renamed: false,
    }
  }
}

/**
 * Looks an asset up with the Admin API under the given delivery type. Returns undefined when
 * Cloudinary answers 404, and throws any other error.
 */
async function findAsset(
  asset: DeliveryAsset,
  deliveryType: CloudinaryDeliveryType,
): Promise<Record<string, any> | undefined> {
  try {
    return await cloudinary.api.resource(asset.publicId, {
      type: deliveryType,
      resource_type: asset.resourceType || 'image',
    })
  } catch (error) {
    if (httpCodeOf(error) === 404) return undefined
    throw error
  }
}

/**
 * Every version row of a document, read in every locale, or none when the collection keeps no
 * versions.
 */
async function storedVersions(
  payload: Payload,
  req: PayloadRequest,
  collection: string,
  id: number | string,
): Promise<VersionRow[]> {
  if (!payload.collections[collection]?.config.versions) return []
  const { docs } = await payload.db.findVersions<Record<string, any>>({
    collection,
    where: { parent: { equals: id } },
    locale: 'all',
    pagination: false,
    req,
  })
  return docs as VersionRow[]
}

/**
 * Puts back the version rows already written and, when this run renamed the asset, moves it back
 * to its stored type, after a write failed. When any of that fails too, the error says which row or asset disagrees.
 */
async function restoreDocument({
  payload,
  req,
  collection,
  written,
  asset,
  renamed,
  stored,
  error,
}: {
  payload: Payload
  req: PayloadRequest
  collection: string
  written: VersionRow[]
  asset: DeliveryAsset
  renamed: boolean
  stored: DeliveryAsset
  error: unknown
}): Promise<void> {
  const disagreements: string[] = []

  for (const versionRow of written) {
    try {
      await writeVersionRow(payload, req, collection, versionRow, versionRow.version)
    } catch (restoreError) {
      disagreements.push(
        `restoring version row ${versionRow.id} failed (${messageOf(restoreError)}), so it ` +
          `still records the migrated asset`,
      )
    }
  }

  if (renamed) {
    try {
      await changeDeliveryType(asset, stored.deliveryType)
    } catch (undoError) {
      disagreements.push(
        `moving the asset back to ${stored.deliveryType} failed (${messageOf(undoError)}), so ` +
          `${asset.publicId} is now authenticated while the document still records ` +
          `${stored.deliveryType}. Set its cloudinaryType to authenticated, or move the asset ` +
          `back to ${stored.deliveryType} in Cloudinary`,
      )
    }
  }

  if (disagreements.length > 0) {
    throw new Error(
      `${messageOf(error)}. Undoing the migration failed too: ${disagreements.join('; ')}.`,
    )
  }
}

/** The HTTP status Cloudinary answered a rejected call with, in either SDK shape. */
function httpCodeOf(error: unknown): number | undefined {
  const rejection = error as { http_code?: unknown; error?: { http_code?: unknown } } | undefined
  const code = rejection?.http_code ?? rejection?.error?.http_code
  return typeof code === 'number' ? code : undefined
}

/**
 * Every stored row with a Cloudinary file, a page at a time. The rows come from the database
 * adapter, not the Local API: the read hooks drop the stored URLs the migration has to find.
 */
async function* storedRows(
  payload: Payload,
  req: PayloadRequest,
  collection: string,
): AsyncGenerator<Record<string, any>> {
  for (let page = 1; ; page += 1) {
    const result = await payload.db.find<Record<string, any>>({
      collection,
      where: { cloudinaryPublicId: { exists: true } },
      sort: 'id',
      limit: PAGE_SIZE,
      page,
      req,
    })
    yield* result.docs
    if (!result.hasNextPage) return
  }
}

// A collection has only some of the stored URL fields, and storedURLFieldsOf keeps those, since
// the adapter can't write a field the collection no longer has.
function storedURLFieldsOf(payload: Payload, collection: string): string[] {
  const fields = payload.collections[collection]?.config.flattenedFields ?? []
  return STORED_URL_FIELDS.filter((name) => fields.some((field) => field.name === name))
}

/**
 * Names the public copies of a document. A copy's public ID comes from the stored
 * `publicTransformationPublicId` first. Versions before 1.3.0 seldom stored it, so the copy is
 * also named from their naming rule: the original's public ID, then `_public_`, then the
 * transformation type the document has selected. When both name a copy and differ, both are
 * listed. Versions before 1.3.0 made a copy only of a document marked private.
 */
function publicCopyNamer(
  payload: Payload,
  collection: string,
): (row: Record<string, any>) => string[] {
  const transformConfig = getTransformationConfig(pluginConfigOf(payload, collection))
  if (!transformConfig.publicTransformation?.enabled) return () => []

  const names = fieldNamesOf(transformConfig)
  const enabledField = names.hasPublicTransformation
  const typeField = names.transformationType
  return (row) => {
    if (row.isPrivate !== true) return []
    const names: string[] = []
    if (typeof row.publicTransformationPublicId === 'string' && row.publicTransformationPublicId) {
      names.push(row.publicTransformationPublicId)
    }
    if (row[enabledField] === true) {
      names.push(`${row.cloudinaryPublicId}_public_${row[typeField] || 'watermark'}`)
    }
    return [...new Set(names)]
  }
}

/**
 * A private file needs migrating until it is a typed `authenticated` asset with no stored URL.
 * It is private by the same test the read path uses, so a stored `authenticated` type counts.
 */
function needsMigration(row: Record<string, any>, urlFields: string[]): boolean {
  if (!isPrivateFile(row)) return false
  return row.cloudinaryType !== 'authenticated' || urlFields.some((field) => Boolean(row[field]))
}
