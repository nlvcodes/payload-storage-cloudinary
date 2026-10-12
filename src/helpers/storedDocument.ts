import {
  afterReadTraverseFields,
  sanitizeFallbackLocale,
  type PayloadRequest,
  type SanitizedCollectionConfig,
} from 'payload'
import { storedURLDeliveryType } from './deliveryURL.js'

/**
 * A document as stored, as a read with every field visible shows it: every field, localized
 * fields in one locale, relationship fields as IDs.
 */
export type StoredDocument = Record<string, any> & { id: number | string }

/** Whether a value can be a document ID: a number on the SQL adapters, a string otherwise. */
export function isDocumentID(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string'
}

/**
 * A stored document as this reader sees it.
 *
 * `doc` is the row in the reader's locale, and every URL is built from it. `views` are the
 * documents the access rule decides on: on a localized site, the row in each configured locale,
 * whatever locale the reader asked for. The file is the same in every locale, so a reader gets
 * what the most restrictive view allows, and can't pick a locale that doesn't lock it.
 */
export type StoredRead = {
  doc: StoredDocument
  views: StoredDocument[]
}

/**
 * Reads documents as stored, keyed by `String(id)`. An ID with no stored row is missing from the
 * map. Throws when it can't read or flatten a row, so a caller fails closed.
 *
 * `customAuthCheck` can read any field, so the access rule decides on this, never on a document
 * as a reader got it: `select`, `populate`, depth and field `read` access all change that one. The
 * read goes through the database adapter with the caller's `req`, so it runs inside the caller's
 * transaction, and no collection hook or access check runs. Only call it for documents the caller
 * has already passed the collection's `read` access for.
 *
 * The database returns a localized field keyed by locale (`{ en: true }`). Each row then goes
 * through Payload's own field `afterRead` traversal, the one a read runs, with `depth: 0`,
 * `showHiddenFields` and `overrideAccess`, once per configured locale with the site's fallback
 * locale, and field hooks run. In each view the check sees the values a read with every field
 * visible shows in that locale.
 */
export async function readStoredDocuments(
  req: PayloadRequest,
  collection: string,
  ids: Array<number | string>,
): Promise<Map<string, StoredRead>> {
  const reads = new Map<string, StoredRead>()
  if (ids.length === 0) return reads

  const { docs } = await req.payload.db.find<StoredDocument>({
    collection,
    where: { id: { in: ids } },
    limit: ids.length,
    pagination: false,
    locale: storedLocale(req),
    joins: false,
    req,
  })
  for (const doc of docs) reads.set(String(doc.id), await asReaderSees(req, collection, doc))
  return reads
}

/** Reads one document as stored. Null when there is no stored row. */
export async function readStoredDocument(
  req: PayloadRequest,
  collection: string,
  id: number | string,
): Promise<StoredRead | null> {
  return (await readStoredDocuments(req, collection, [id])).get(String(id)) ?? null
}

/**
 * Reads one stored version and the stored document it belongs to. Null when either is missing.
 *
 * A version read decides on both: the version is what the reader asked for, and the document is
 * what the rule protects, since every version shares its asset. A stale version, or a draft that
 * was never published, can't unlock what the document refuses.
 */
export async function readStoredVersion(
  req: PayloadRequest,
  collection: string,
  versionID: number | string,
): Promise<{ version: StoredRead; parent: StoredRead } | null> {
  const { docs } = await req.payload.db.findVersions<Record<string, any>>({
    collection,
    where: { id: { equals: versionID } },
    limit: 1,
    pagination: false,
    locale: storedLocale(req),
    req,
  })
  const row = docs[0]
  // The database adapter returns the parent as an ID
  const parentID: unknown = row?.parent
  if (!row?.version || !isDocumentID(parentID)) return null

  const parent = await readStoredDocument(req, collection, parentID)
  if (!parent) return null

  // A version's fields are the collection's fields, so it flattens the same way
  const version = await asReaderSees(req, collection, { ...row.version, id: parentID })
  return { version, parent }
}

/** The locale a stored-document read uses: the caller's, when it names one. */
export function storedLocale(req: PayloadRequest): string | undefined {
  return typeof req.locale === 'string' ? req.locale : undefined
}

/** The row in every configured locale, and which of them is the reader's. */
async function asReaderSees(
  req: PayloadRequest,
  collection: string,
  row: StoredDocument,
): Promise<StoredRead> {
  const config = req.payload.collections[collection]?.config
  if (!config) throw new Error(`Unknown collection: ${collection}`)
  const localization = req.payload.config.localization

  // A read resolves a legacy record's type in the beforeRead hook, from its stored URLs, before
  // the field hooks rewrite them (Payload v4 rebuilds `original.url`). Flattening runs only the
  // field hooks, so it is resolved here first.
  if (row.cloudinaryPublicId && !row.cloudinaryType) {
    const deliveryType = storedURLDeliveryType(row)
    if (deliveryType) row.cloudinaryType = deliveryType
  }

  if (!localization) {
    const doc = await flatten(req, config, row, null, null)
    return { doc, views: [doc] }
  }

  // Each locale with the fallback the site configured, so the reader's `fallback-locale` can't
  // change a decision. Flattening rewrites the row in place, so each locale gets its own copy.
  const views = await Promise.all(
    localization.localeCodes.map((code) => {
      const fallbackLocale = sanitizeFallbackLocale({
        fallbackLocale: undefined as unknown as string,
        locale: code,
        localization,
      })
      return flatten(
        req,
        config,
        copyStoredRow(row),
        code,
        typeof fallbackLocale === 'string' ? fallbackLocale : null,
      )
    }),
  )

  // Payload's own reads set the locale. `locale=all`, or a request without one, builds the URLs
  // from the default locale. The asset fields aren't localized, so every view has the same ones.
  const index = localization.localeCodes.indexOf(storedLocale(req) ?? '')
  const doc =
    views[index >= 0 ? index : localization.localeCodes.indexOf(localization.defaultLocale)] ??
    views[0]
  return { doc, views }
}

/**
 * A copy of a stored row that flattening one locale can rewrite without touching the others.
 * Throws when the row holds a value it can't copy, so the caller fails closed.
 *
 * Payload's own read never copies: it flattens the adapter's row in place, once, so a field hook
 * sees the values the adapter returned. Flattening only replaces properties of the row's plain
 * objects and arrays, so those are copied, and every other value is a leaf to the traversal and
 * is kept as it is, prototype included. A check that calls `toHexString()` or `instanceof Date`
 * then sees what it would see in Payload's own read. `structuredClone` would turn an ObjectId
 * into a plain object with no methods, and throws on a function.
 *
 * The SQL adapters return plain JSON. A MongoDB row can hold BSON values (an ObjectId, a
 * Decimal128, a Binary, each naming itself with `_bsontype`), Dates and Buffers, which are kept.
 * An object of any other class, or a row that contains itself, is refused rather than shared
 * between locales, since a field hook could change it in place for one locale and the next
 * locale would see the change.
 */
export function copyStoredRow<T>(value: T, ancestors: Set<object> = new Set()): T {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') throw new Error('A stored row holds a function')
    return value
  }
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (ArrayBuffer.isView(value) || isBSONValue(value)) return value

  const prototype: unknown = Object.getPrototypeOf(value)
  const isArray = Array.isArray(value)
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`A stored row holds a value the plugin can't copy: ${classNameOf(value)}`)
  }
  if (ancestors.has(value)) throw new Error('A stored row contains itself')

  ancestors.add(value)
  const copy: Record<string, unknown> = isArray ? ([] as unknown as Record<string, unknown>) : {}
  if (prototype === null) Object.setPrototypeOf(copy, null)
  // defineProperty keeps a `__proto__` key from a stored JSON value as data, where an
  // assignment would set what the copy inherits.
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: copyStoredRow(entry, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  ancestors.delete(value)
  return copy as T
}

const classNameOf = (value: object): string =>
  (value.constructor as { name?: string } | undefined)?.name ?? 'unknown'

// A BSON value is a class instance. A plain object naming a `_bsontype`, such as a stored JSON
// value on a SQL adapter, is data and gets copied.
const isBSONValue = (value: object) =>
  Object.getPrototypeOf(value) !== Object.prototype &&
  Object.getPrototypeOf(value) !== null &&
  typeof (value as { _bsontype?: unknown })._bsontype === 'string'

/**
 * Runs Payload's field `afterRead` traversal on the row, in place, as Payload's `afterRead` does
 * for a read, without the collection hooks a read runs after it.
 */
async function flatten(
  req: PayloadRequest,
  collection: SanitizedCollectionConfig,
  doc: StoredDocument,
  locale: string | null,
  fallbackLocale: string | null,
): Promise<StoredDocument> {
  const fieldPromises: Promise<void>[] = []
  const populationPromises: Promise<void>[] = []

  afterReadTraverseFields({
    collection,
    context: req.context ?? {},
    currentDepth: 1,
    depth: 0,
    doc,
    draft: false,
    fallbackLocale,
    fieldPromises,
    fields: collection.fields,
    findMany: false,
    flattenLocales: true,
    global: null,
    locale,
    overrideAccess: true,
    parentIndexPath: '',
    parentIsLocalized: false,
    parentPath: '',
    parentSchemaPath: '',
    populationPromises,
    req,
    showHiddenFields: true,
    siblingDoc: doc,
  })

  // A field promise can add more, so drain them the way Payload's afterRead does
  for (let round = 0; fieldPromises.length > 0 || populationPromises.length > 0; round += 1) {
    if (round >= 100) throw new Error('A field afterRead hook kept adding promises')
    await Promise.all(fieldPromises.splice(0))
    await Promise.all(populationPromises.splice(0))
  }

  return doc
}
