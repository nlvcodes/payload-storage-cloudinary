import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import type { PayloadRequest } from 'payload'
import { getSignedURL } from '../helpers/serverHelpers.js'
import { isDocumentID } from '../helpers/storedDocument.js'

const notFound = () => new Response('Not found', { status: 404 })

/**
 * Redirects a file request to the file, for a reader the plugin gives it.
 *
 * The plugin installs with `disablePayloadAccessControl: true`, so Payload doesn't route file
 * requests here today. If it does, the handler decides the way the plugin does everywhere else,
 * through `getSignedURL`: the document is looked up with the collection's `read` access
 * enforced, read as stored, and the access rule runs on it in every configured locale. The `doc`
 * Payload passes is at most the raw database row, with localized fields keyed by locale, so it
 * only names the document and never decides. A file request with no document, or one the reader
 * may not have, gets a 404.
 */
export const createStaticHandler =
  (): StaticHandler =>
  async (req, { params, doc }) => {
    try {
      const { collection, filename } = params
      const id =
        (doc as { id?: unknown } | undefined)?.id ?? (await idOf(req, collection, filename))
      if (!isDocumentID(id)) return notFound()

      const url = await getSignedURL({ payload: req.payload, collection, docId: id, req })
      if (!url) return notFound()

      return new Response(null, { status: 302, headers: { Location: url } })
    } catch (error) {
      console.error('[Cloudinary Static] Error:', error)
      return notFound()
    }
  }

/** The ID of the document that holds `filename`, looked up as the reader. */
async function idOf(req: PayloadRequest, collection: string, filename: string): Promise<unknown> {
  const { docs } = await req.payload.find({
    collection,
    where: { filename: { equals: filename } },
    req,
    overrideAccess: false,
    depth: 0,
    limit: 1,
  })
  return docs[0]?.id
}
