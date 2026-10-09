import { describe, it, expect, vi } from 'vitest'
import { resolveFileAccess } from '../../../helpers/accessRule'
import type { CloudinaryCollectionConfig } from '../../../types'

// The rule assumes the caller fetched the document with `read` access enforced,
// so every reader here is one Payload already let through.
describe('resolveFileAccess', () => {
  const req = { user: { id: 1 } }
  const doc = { id: 1, hasPublicTransformation: true }

  const withPreview = (privateFiles: CloudinaryCollectionConfig['privateFiles']) => ({
    privateFiles,
    transformations: {
      default: { quality: 'auto' },
      publicTransformation: { enabled: true },
    },
  })

  it('gives the original to a reader when there is no customAuthCheck and no preview', async () => {
    expect(await resolveFileAccess(req, doc, { privateFiles: true })).toBe('original')
  })

  it('gives the original when customAuthCheck passes', async () => {
    const config = { privateFiles: { enabled: true, customAuthCheck: () => true } }
    expect(await resolveFileAccess(req, doc, config)).toBe('original')
  })

  it('gives nothing when customAuthCheck denies and the collection has no preview', async () => {
    const config = { privateFiles: { enabled: true, customAuthCheck: async () => false } }
    expect(await resolveFileAccess(req, doc, config)).toBe('none')
  })

  it('passes the request and the document to customAuthCheck', async () => {
    const customAuthCheck = vi.fn().mockReturnValue(true)
    await resolveFileAccess(req, doc, { privateFiles: { enabled: true, customAuthCheck } })
    expect(customAuthCheck).toHaveBeenCalledWith(req, doc)
  })

  it('reads customAuthCheck from the legacy signedURLs option', async () => {
    const config = { signedURLs: { enabled: true, customAuthCheck: () => false } }
    expect(await resolveFileAccess(req, doc, config)).toBe('none')
  })

  it('refuses the original on a publicTransformation collection with no customAuthCheck', async () => {
    expect(await resolveFileAccess(req, doc, withPreview(true))).toBe('preview')
  })

  it('refuses the original on the documented publicTransformation shape with no default key', async () => {
    const config = {
      privateFiles: true,
      transformations: { preserveOriginal: true, publicTransformation: { enabled: true } },
    }
    expect(await resolveFileAccess(req, doc, config)).toBe('preview')
  })

  it('gives the preview when customAuthCheck denies on a publicTransformation collection', async () => {
    const config = withPreview({ enabled: true, customAuthCheck: () => false })
    expect(await resolveFileAccess(req, doc, config)).toBe('preview')
  })

  it('gives the original when customAuthCheck passes on a publicTransformation collection', async () => {
    const config = withPreview({ enabled: true, customAuthCheck: () => true })
    expect(await resolveFileAccess(req, doc, config)).toBe('original')
  })

  it('gives nothing to a preview reader when the document has no preview', async () => {
    const noPreviewDoc = { id: 2, hasPublicTransformation: false }
    expect(await resolveFileAccess(req, noPreviewDoc, withPreview(true))).toBe('none')
  })

  it('reads the preview flag from the configured field name', async () => {
    const config = {
      privateFiles: true,
      transformations: {
        default: {},
        publicTransformation: { enabled: true, fieldName: 'showPreview' },
      },
    }
    expect(await resolveFileAccess(req, { id: 3, showPreview: true }, config)).toBe('preview')
    expect(await resolveFileAccess(req, { id: 3, hasPublicTransformation: true }, config)).toBe(
      'none',
    )
  })
})
