import type { CollectionBeforeReadHook } from 'payload'
import { storedURLDeliveryType } from '../helpers/deliveryURL.js'

/**
 * Resolves the delivery type of a record from before 1.3.0, which has no `cloudinaryType`.
 *
 * The type lives in the stored original URL. Field `read` access strips that URL before the
 * collection afterRead hook, the endpoints and the helpers see the document, so it is read here,
 * on the raw row, and kept in `cloudinaryType`.
 */
export const createBeforeReadHook =
  (): CollectionBeforeReadHook =>
  async ({ doc }) => {
    if (!doc?.cloudinaryPublicId || doc.cloudinaryType) {
      return doc
    }

    const deliveryType = storedURLDeliveryType(doc)
    if (deliveryType) {
      doc.cloudinaryType = deliveryType
    }

    return doc
  }
