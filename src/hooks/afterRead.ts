import type { CollectionAfterReadHook, PayloadRequest } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'
import {
  fieldNamesOf,
  getSignedURLConfig,
  getTransformationConfig,
} from '../helpers/normalizeConfig.js'
import { resolveViewsAccess, type FileAccess } from '../helpers/accessRule.js'
import { PLUGIN_FIELDS, pluginFieldNames } from '../helpers/pluginFields.js'
import { isDocumentID, readStoredDocument, readStoredVersion } from '../helpers/storedDocument.js'
import {
  buildDeliveryURL,
  clearOriginalURL,
  deliveryAssetOf,
  isPrivateFile,
  storedURLDeliveryType,
  THUMBNAIL_TRANSFORMATION,
  type DeliveryAsset,
} from '../helpers/deliveryURL.js'
import {
  buildWatermarkTransformation,
  buildImageWatermarkTransformation,
  buildBlurTransformation,
} from '../helpers/watermark.js'

/**
 * Builds every delivery URL of a document at read time, after Payload ran the collection's `read`
 * access for this reader. Nothing deliverable is stored, so each URL here is built fresh from the
 * stored asset fields and the access rule.
 *
 * On every Cloudinary collection it drops the stored `cloudinaryUrl`, which no read returns, and
 * sets `originalUrl` fresh for a public file. A private document never returns `originalUrl` or
 * `original.url`: a reader with the original gets it through `url` or the signed-URL endpoint.
 * Field access hides both stored URLs too, but the Local API skips field access by default, so
 * this hook is what keeps them out of every read.
 *
 * On a `privateFiles` collection it also sets `url`, `thumbnailURL`, `transformedUrl` and
 * `previewUrl`, and nulls the ones the reader may not have. On a collection with preset
 * selection, it sets `transformedUrl`.
 *
 * `select`, `populate` and field access can leave any field out of the document this hook gets.
 * On a `privateFiles` collection the hook therefore decides on the whole stored document, read
 * through the database adapter in every locale, and builds every URL from that same
 * document. When it can't read or flatten it, or a projected document lacks the asset fields,
 * every URL field is null.
 */
export const createAfterReadHook =
  (collectionSlug: string, config: CloudinaryCollectionConfig): CollectionAfterReadHook =>
  async ({ doc, req, findMany, query }) => {
    if (!doc) {
      return doc
    }

    const read = await decisionSource(collectionSlug, config, doc, req, findMany, query)
    if (!read) {
      return withholdURLs(doc, config)
    }
    const { source, views, whole } = read

    // A projected document that lacks a field the decision needs can't be decided on
    if (!whole && requiredFields(config).some((field) => !(field in source))) {
      return withholdURLs(doc, config)
    }

    if (!source.cloudinaryPublicId) {
      return doc
    }

    const transformConfig = getTransformationConfig(config)
    // Every URL below is signed when the stored asset is authenticated
    const asset = deliveryAssetOf(source)
    const isPrivate = isPrivateFile(source)

    // customAuthCheck may read any field, so it only ever runs on the whole stored document
    if (isPrivate && !whole && getSignedURLConfig(config)?.customAuthCheck) {
      return withholdURLs(doc, config)
    }
    const access: FileAccess = isPrivate ? await resolveViewsAccess(req, views, config) : 'original'
    const original = access === 'original'

    // A stored delivery URL is a permanent link, so no read hands one out. A legacy record's
    // type lives in those URLs, so keep it on the document, as the beforeRead hook does, for
    // any hook that reads this document later.
    if (!doc.cloudinaryType) {
      const storedType = storedURLDeliveryType(source)
      if (storedType) doc.cloudinaryType = storedType
    }
    delete doc.cloudinaryUrl
    if (isPrivate) {
      delete doc.originalUrl
      clearOriginalURL(doc)
    } else {
      doc.originalUrl = buildDeliveryURL(asset)
    }

    if (config.privateFiles) {
      const defaults = transformConfig.default
      doc.url = original
        ? buildDeliveryURL(asset, {
            transformation: defaults && Object.keys(defaults).length > 0 ? defaults : undefined,
          })
        : null
      doc.thumbnailURL = original
        ? buildDeliveryURL(asset, { transformation: THUMBNAIL_TRANSFORMATION })
        : null

      // Built by older versions and kept in the database. A reader without the original gets
      // `previewUrl` only, so that reader loses it.
      if (!original && 'publicTransformationUrl' in doc) {
        doc.publicTransformationUrl = null
      }
    }

    const presetTransformations = selectedPresetTransformations(source, transformConfig)

    // When preserveOriginal is true and preset selection is enabled, generate URLs dynamically
    if (transformConfig.preserveOriginal && transformConfig.enablePresetSelection) {
      // A transformed private file is the original, so only a reader with `original` gets it
      doc.transformedUrl =
        original && Object.keys(presetTransformations).length > 0
          ? buildDeliveryURL(asset, { transformation: presetTransformations })
          : null
    } else if (config.privateFiles) {
      doc.transformedUrl = null
    }

    if (config.privateFiles) {
      doc.previewUrl =
        access !== 'none' ? previewURL(source, transformConfig, asset, presetTransformations) : null
    }

    return doc
  }

type DecisionSource = {
  /** The document every URL is built from. */
  source: Record<string, any>
  /** The documents the access rule decides on. The reader gets what the most restrictive allows. */
  views: Record<string, any>[]
  /** Whether `source` is the whole stored document, or the document as the read projected it. */
  whole: boolean
}

/**
 * Finds the document to decide on. Null when the hook needs the stored document and can't read
 * or flatten it, so the read gets no URL.
 *
 * On a `privateFiles` collection that is the stored row as a read with every field visible shows
 * it, in each locale (see readStoredDocuments). It is read through the database adapter
 * with the reader's `req`, so inside the reader's transaction, and no collection hook runs again.
 * A read with `draft` decides on the stored document, not the draft, and builds the URLs from the
 * stored file. A version read by ID builds the URLs from that stored version, and decides on both
 * it and the stored document, so a stale version or an unpublished draft can't unlock what the
 * document refuses. A versions list gives the hook no version ID, so it decides on the projected
 * version, and only when no customAuthCheck has to run.
 */
async function decisionSource(
  collection: string,
  config: CloudinaryCollectionConfig,
  doc: Record<string, any>,
  req: PayloadRequest,
  findMany: boolean | undefined,
  query: Record<string, any> | undefined,
): Promise<DecisionSource | null> {
  if (!config.privateFiles) {
    return { source: doc, views: [doc], whole: false }
  }

  try {
    if (doc.id !== undefined && doc.id !== null) {
      const read = await readStoredDocument(req, collection, doc.id)
      return read ? { source: read.doc, views: read.views, whole: true } : null
    }

    // A version's document carries no ID. findVersionByID passes the version's ID in `query`.
    const versionID = findMany ? undefined : versionIDOf(query)
    if (versionID !== undefined) {
      const read = await readStoredVersion(req, collection, versionID)
      return read
        ? {
            source: read.version.doc,
            views: [...read.version.views, ...read.parent.views],
            whole: true,
          }
        : null
    }
  } catch (error) {
    req.payload.logger.error({ err: error, msg: 'Could not read the stored document' })
    return null
  }

  return { source: doc, views: [doc], whole: false }
}

// The version ID in the query findVersionByID builds: `{ and: [{ id: { equals } }, access] }`
function versionIDOf(query: Record<string, any> | undefined): number | string | undefined {
  const id = query?.and?.[0]?.id?.equals
  return isDocumentID(id) ? id : undefined
}

/**
 * The fields a projected document must carry for the hook to decide on it. `pluginReadSelect`
 * adds them to every read that selects fields, so only a read that excludes one of them lacks it.
 */
function requiredFields(config: CloudinaryCollectionConfig): string[] {
  return pluginFieldNames('decisionNeeds', Boolean(config.privateFiles))
}

/** Fails closed: the read returns no delivery URL. */
function withholdURLs(
  doc: Record<string, any>,
  config: CloudinaryCollectionConfig,
): Record<string, any> {
  for (const { name, withheld, withheldWhen } of PLUGIN_FIELDS) {
    if (withheld === 'remove') {
      delete doc[name]
    } else if (
      withheld === 'null' &&
      (!withheldWhen ||
        withheldWhen.some((when) =>
          when === 'privateFiles' ? Boolean(config.privateFiles) : name in doc,
        ))
    ) {
      doc[name] = null
    }
  }
  clearOriginalURL(doc)
  return doc
}

/**
 * The plugin's own fields the read hooks need, for the collection's `forceSelect`. Payload adds
 * them to every read that selects fields, `populate` and versions included, so the hooks still
 * find the asset and its privacy.
 */
export function pluginReadSelect(config: CloudinaryCollectionConfig): Record<string, true> {
  const transformConfig = getTransformationConfig(config)
  const names = fieldNamesOf(transformConfig)
  const fields = pluginFieldNames('readHooksNeed', Boolean(config.privateFiles))

  if (transformConfig.enablePresetSelection && transformConfig.presets?.length) {
    fields.push(names.transformationPreset)
  }

  if (config.privateFiles) {
    const publicConfig = transformConfig.publicTransformation
    if (publicConfig?.enabled) {
      fields.push(names.hasPublicTransformation, names.transformationType, names.watermarkText)
    }
  }

  return Object.fromEntries(fields.map((field) => [field, true]))
}

type TransformConfig = ReturnType<typeof getTransformationConfig>

// The default transformations, then each selected preset in order. Later presets win.
function selectedPresetTransformations(
  doc: Record<string, any>,
  transformConfig: TransformConfig,
): Record<string, any> {
  const selectedPresets = doc[fieldNamesOf(transformConfig).transformationPreset]
  let combined: Record<string, any> = { ...(transformConfig.default || {}) }

  if (selectedPresets && transformConfig.presets) {
    const presetArray = Array.isArray(selectedPresets) ? selectedPresets : [selectedPresets]
    for (const presetName of presetArray) {
      const preset = transformConfig.presets.find((p) => p.name === presetName)
      if (preset) {
        combined = { ...combined, ...preset.transformations }
      }
    }
  }

  return combined
}

// The selected presets with the watermark or blur on top, or null when the document has no
// preview.
function previewURL(
  doc: Record<string, any>,
  transformConfig: TransformConfig,
  asset: DeliveryAsset,
  presetTransformations: Record<string, any>,
): string | null {
  const publicConfig = transformConfig.publicTransformation
  const names = fieldNamesOf(transformConfig)
  if (
    !publicConfig?.enabled ||
    doc.isPrivate !== true ||
    doc[names.hasPublicTransformation] !== true
  ) {
    return null
  }

  // Anything but blur is watermarked, with the default text when the config sets no watermark,
  // so a preview never goes out as the bare original
  const transformationType = doc[names.transformationType]
  const watermark = publicConfig.watermark ?? {}
  const publicTransformation =
    transformationType === 'blur'
      ? [buildBlurTransformation(publicConfig.blur)]
      : watermark.imageId
        ? buildImageWatermarkTransformation(watermark)
        : buildWatermarkTransformation(watermark, doc[names.watermarkText])

  // Cloudinary applies transformations in order, so presets first, then the watermark or blur
  const combined: Record<string, any>[] = []
  if (Object.keys(presetTransformations).length > 0) {
    combined.push(presetTransformations)
  }
  combined.push(...publicTransformation)

  // Signed for an authenticated original, so dropping the watermark or blur breaks it
  return buildDeliveryURL(asset, { transformation: combined })
}
