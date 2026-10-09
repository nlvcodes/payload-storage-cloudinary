/**
 * Writes to stored rows through the database adapter, in the request's transaction. No
 * collection hook, validation or access check runs. The asset-move hooks and migratePrivateAssets
 * both write this way, so a failed write can only be a database error.
 */

import type { Payload, PayloadRequest, TypeWithID } from 'payload'

/**
 * Writes some fields of a document's row, and the rest of the row as it is now.
 *
 * The SQL adapters write a row with an `INSERT ... ON CONFLICT DO UPDATE`, and the insert has to
 * satisfy every NOT NULL column before the conflict turns it into an update, so a write of a few
 * fields fails on a collection with a required field. The row is read in every locale, the shape
 * Payload's own update writes, because the SQL adapters replace a row's localized values with the
 * locales the data holds.
 *
 * The read skips joins and the data leaves out `id`, since neither is a value the write stores. A
 * join field has no column on the SQL adapters and no schema path on MongoDB, so the joined
 * documents could only be read for nothing. The `id` argument names the row: the SQL adapters
 * set the row's ID from it, and MongoDB finds the document by it.
 */
export async function writeStoredRow(
  payload: Payload,
  req: PayloadRequest,
  collection: string,
  id: number | string,
  fields: Record<string, unknown>,
): Promise<void> {
  const current = await payload.db.findOne<TypeWithID & Record<string, any>>({
    collection,
    where: { id: { equals: id } },
    locale: 'all',
    joins: false,
    req,
  })
  if (!current) throw new Error(`Document ${id} of ${collection} no longer exists`)
  const data: Record<string, unknown> = { ...current, ...fields }
  delete data.id
  await payload.db.updateOne({ collection, id, data, req, returning: false })
}

/** A version row as the database adapter returns it: its own columns, and the document data. */
export type VersionRow = { id: number | string; version: Record<string, any> } & Record<string, any>

/**
 * Writes the document data of a version row. The row's other columns go back as they were, since
 * an adapter may replace the whole row. Pass the row as the adapter read it, every locale
 * included, since the SQL adapters replace a row's localized values with the locales the data
 * holds.
 */
export async function writeVersionRow(
  payload: Payload,
  req: PayloadRequest,
  collection: string,
  { id, ...versionRow }: VersionRow,
  version: Record<string, any>,
): Promise<void> {
  await payload.db.updateVersion({
    collection,
    id,
    versionData: { ...versionRow, version } as any,
    req,
  })
}
