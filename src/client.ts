/**
 * Client-side exports for payload-storage-cloudinary
 *
 * Import from 'payload-storage-cloudinary/client' to avoid server dependencies in client components
 */

export {
  fetchSignedURL,
  fetchSignedURLs,
  useSignedURL,
  requiresSignedURL,
  getImageURL,
  createPrivateImageComponent,
} from './helpers/clientHelpers.js'

// Export client-safe transformation utilities (no cloudinary dependency)
export { getTransformationUrl, commonPresets } from './helpers/clientTransformations.js'

// Export types
export type { TransformationPreset } from './types.js'
