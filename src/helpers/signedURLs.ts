/**
 * Signed URL Helper Functions
 * 
 * SECURITY MODEL:
 * 1. Access control is primarily handled by Payload's collection-level access control
 * 2. When endpoints call req.payload.findByID() or req.payload.find() with the req object,
 *    Payload automatically enforces read access based on the collection's access control config
 * 3. The isAccessAllowed() function is for ADDITIONAL checks beyond Payload's access control
 * 4. Documents that reach isAccessAllowed() have already passed Payload's access checks
 */

import { v2 as cloudinary } from 'cloudinary'
import { createHmac } from 'crypto'
import type { SignedURLConfig } from '../types.js'

export interface SignedURLOptions {
  publicId: string
  version?: number
  resourceType?: string
  format?: string
  transformations?: Record<string, any>
  expiresIn?: number // seconds
  authToken?: boolean
  attachmentFilename?: string
}

export function generateSignedURL(options: SignedURLOptions, config?: SignedURLConfig): string {
  const {
    publicId,
    version,
    resourceType = 'image',
    format,
    transformations,
    expiresIn = config?.expiresIn || 3600, // 1 hour default
    authToken = true,
    attachmentFilename,
  } = options
  
  const timestamp = Math.round(Date.now() / 1000)
  const expiresAt = timestamp + expiresIn
  
  // Build the URL options
  const urlOptions: any = {
    secure: true,
    sign_url: true,
    type: 'authenticated',
    expires_at: expiresAt,
  }
  
  if (version) {
    urlOptions.version = version
  }
  
  if (transformations && config?.includeTransformations !== false) {
    urlOptions.transformation = transformations
  }
  
  if (attachmentFilename) {
    urlOptions.attachment = attachmentFilename
  }
  
  // Generate auth token for additional security
  if (authToken) {
    const apiKey = cloudinary.config().api_key
    if (!apiKey) {
      throw new Error('Cloudinary API key is required for auth tokens')
    }
    
    const authTokenOptions = {
      key: apiKey,
      duration: expiresIn,
      acl: `/${resourceType}/*/${publicId}`,
      start_time: timestamp,
    }
    
    urlOptions.auth_token = generateAuthToken(authTokenOptions)
  }
  
  // Build the full resource identifier
  const resourceIdentifier = format ? `${publicId}.${format}` : publicId
  
  return cloudinary.url(resourceIdentifier, urlOptions)
}

function generateAuthToken(options: {
  key: string
  duration: number
  acl: string
  start_time: number
}): Record<string, any> {
  const { key, duration, acl, start_time } = options
  const secret = cloudinary.config().api_secret
  
  if (!secret) {
    throw new Error('Cloudinary API secret is required for auth tokens')
  }
  
  const auth = {
    timestamp: start_time,
    duration,
    acl,
  }
  
  // Create the auth string
  const authString = Object.entries(auth)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  
  // Generate HMAC signature
  const signature = createHmac('sha256', secret)
    .update(authString)
    .digest('hex')
  
  return {
    ...auth,
    signature,
    key,
  }
}

export function generatePrivateUploadOptions(config: SignedURLConfig): Record<string, any> {
  const options: Record<string, any> = {
    type: 'authenticated',
    access_mode: 'authenticated',
  }
  
  // Add auth types if specified
  if (config.authTypes && config.authTypes.length > 0) {
    options.access_type = config.authTypes.join(',')
  }
  
  return options
}

export function generateDownloadURL(
  publicId: string,
  filename: string,
  options?: {
    expiresIn?: number
    resourceType?: string
    version?: number
  }
): string {
  return generateSignedURL({
    publicId,
    resourceType: options?.resourceType,
    version: options?.version,
    attachmentFilename: filename,
    expiresIn: options?.expiresIn,
  })
}

export async function isAccessAllowed(
  req: any,
  doc: any,
  config?: SignedURLConfig
): Promise<boolean> {
  // If custom auth check is provided, use it
  if (config?.customAuthCheck) {
    return config.customAuthCheck(req, doc)
  }
  
  // IMPORTANT: The actual access control check is already performed by Payload's
  // findByID query in the endpoint. When the document is returned, it means
  // the user has read access according to the collection's access control.
  // This function is just for additional checks beyond Payload's access control.
  
  // If we got here, the user already has read access to the document
  // per Payload's collection access control because findByID was successful
  return true
}