/**
 * The asset moves of one request, kept on `req.context` so the change hooks and the error hook
 * of the same save find them.
 *
 * The rule they follow: no asset is ever at type `upload` while a stored row (document or
 * version) says the file is private. When the plugin can't keep the asset and the row in step,
 * it leaves a broken link rather than an exposed file. So a move that ends at `authenticated`, or
 * that stays at `upload`, happens in `beforeChange`, before the save, and a move from
 * `authenticated` to `upload` waits for `afterChange`, after the row says the file is public.
 */

import type { PayloadRequest, TypeWithID } from 'payload'
import { deliveryAssetOf, type DeliveryAsset } from '../helpers/deliveryURL.js'
import type { RenameTarget } from '../helpers/renameAsset.js'

const CONTEXT_KEY = 'cloudinaryStorageAssetMoves'

/** A rename this request carried out. */
export interface AssetMove {
  collection: string
  id: number | string
  /** The asset before the rename, as the row recorded it. */
  from: DeliveryAsset
  /** The asset as Cloudinary reported it after the rename. */
  to: DeliveryAsset
}

/** A move to `upload` that `beforeChange` planned and `afterChange` carries out. */
export interface PlannedMove {
  collection: string
  id: number | string
  from: DeliveryAsset
  target: RenameTarget
  /** The row's privacy and folder fields before the save, written back when the move fails. */
  restore: Record<string, unknown>
}

interface RequestMoves {
  planned: Record<string, PlannedMove>
  done: AssetMove[]
}

function movesOf(req: PayloadRequest): RequestMoves {
  const context = req.context as Record<string, unknown>
  context[CONTEXT_KEY] ??= { planned: {}, done: [] }
  return context[CONTEXT_KEY] as RequestMoves
}

const keyOf = (collection: string, id: number | string) => `${collection}:${id}`

export function planMove(req: PayloadRequest, move: PlannedMove): void {
  movesOf(req).planned[keyOf(move.collection, move.id)] = move
}

/** Returns the move planned for a document and forgets it, so it runs once. */
export function takePlannedMove(
  req: PayloadRequest,
  collection: string,
  id: number | string,
): PlannedMove | undefined {
  const { planned } = movesOf(req)
  const key = keyOf(collection, id)
  const move = planned[key]
  delete planned[key]
  return move
}

export function recordMove(req: PayloadRequest, move: AssetMove): void {
  movesOf(req).done.push(move)
}

/** Forgets a move that was undone already. */
export function forgetMove(req: PayloadRequest, move: AssetMove): void {
  const { done } = movesOf(req)
  const index = done.indexOf(move)
  if (index >= 0) done.splice(index, 1)
}

/** The moves this request carried out on a collection, newest first. */
export function movesDoneIn(req: PayloadRequest, collection: string): AssetMove[] {
  return movesOf(req)
    .done.filter((move) => move.collection === collection)
    .reverse()
}

/** The stored document row, read through the database adapter in the request's transaction. */
export async function storedRow(
  req: PayloadRequest,
  collection: string,
  id: number | string,
): Promise<(TypeWithID & Record<string, any>) | null> {
  return req.payload.db.findOne<TypeWithID & Record<string, any>>({
    collection,
    where: { id: { equals: id } },
    req,
  })
}

/** Whether a stored row records this asset: its public ID and its delivery type. */
export function recordsAsset(row: Record<string, any>, asset: DeliveryAsset): boolean {
  return (
    row.cloudinaryPublicId === asset.publicId &&
    deliveryAssetOf(row).deliveryType === asset.deliveryType
  )
}
