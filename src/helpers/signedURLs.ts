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

export function isAccessAllowed(
  req: any,
  doc: any,
  config?: SignedURLConfig
): boolean | Promise<boolean> {
  // If custom auth check is provided, use it
  if (config?.customAuthCheck) {
    return config.customAuthCheck(req, doc)
  }
  
  // Default checks
  
  // Check if user is authenticated
  if (!req.user) {
    return false
  }
  
  // Check if user owns the document
  if (doc.owner && doc.owner !== req.user.id) {
    return false
  }
  
  // Check collection-level access
  if (req.user.role === 'admin') {
    return true
  }
  
  // Default to allowing authenticated users
  return true
}