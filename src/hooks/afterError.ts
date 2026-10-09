import type { CollectionAfterErrorHook } from 'payload'
import { isPrivateFile } from '../helpers/deliveryURL.js'
import { messageOf } from '../helpers/errorMessage.js'
import { moveBack } from './afterChange.js'
import { movesDoneIn, recordsAsset, storedRow } from './assetMoves.js'

/**
 * Moves an asset back after a save that moved it failed, so the asset and the stored row agree.
 *
 * Payload calls a collection's afterError hooks for a failed request to its REST routes, after it
 * rolled back the transaction. It runs none for a failed GraphQL or Local API call. A row that
 * still records the asset as it was before the move gets its asset back. A row that records the
 * moved asset kept the save's write, on an adapter without transactions, and already agrees. The
 * asset never moves back to `upload` while the row says the file is private: a broken link beats
 * an exposed file.
 */
export const createAfterErrorHook =
  (collectionSlug: string): CollectionAfterErrorHook =>
  async ({ req }) => {
    for (const move of movesDoneIn(req, collectionSlug)) {
      try {
        const row = await storedRow(req, collectionSlug, move.id)
        if (!row || !recordsAsset(row, move.from)) continue
        if (move.from.deliveryType === 'upload' && isPrivateFile(row)) continue
        await moveBack(req, move)
      } catch (error) {
        req.payload.logger.error({
          msg: 'Failed to check a Cloudinary asset after a failed save',
          collection: collectionSlug,
          id: move.id,
          error: messageOf(error),
        })
      }
    }
  }
