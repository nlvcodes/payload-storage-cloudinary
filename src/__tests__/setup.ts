import { vi, beforeEach } from 'vitest'

// Set test environment variables directly
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
process.env.CLOUDINARY_API_KEY = 'test-key'
process.env.CLOUDINARY_API_SECRET = 'test-secret'

// Mock Cloudinary v2
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload: vi.fn(),
      upload_stream: vi.fn(),
      upload_large_stream: vi.fn(),
      destroy: vi.fn(),
    },
    api: {
      sub_folders: vi.fn(),
      create_folder: vi.fn(),
    },
    url: vi.fn((publicId, options) => {
      // Simple mock URL generation
      const transforms = options?.transformation ? 
        Object.entries(options.transformation)
          .map(([key, value]) => `${key.charAt(0)}_${value}`)
          .join(',') + '/' : ''
      return `https://res.cloudinary.com/test-cloud/image/upload/${transforms}${publicId}`
    }),
    utils: {
      sign_url: vi.fn((url) => url + '?signature=test'),
      api_sign_request: vi.fn(() => ({ signature: 'test-signature' })),
    },
  },
}))

// Mock Payload CMS plugin-cloud-storage
vi.mock('@payloadcms/plugin-cloud-storage', () => ({
  cloudStoragePlugin: vi.fn((config) => config),
}))

// Global test utilities
export const mockFile = (options: {
  filename?: string
  mimeType?: string
  filesize?: number
  buffer?: Buffer
} = {}) => ({
  filename: options.filename || 'test.jpg',
  mimeType: options.mimeType || 'image/jpeg',
  filesize: options.filesize || 1024 * 1024, // 1MB
  buffer: options.buffer || Buffer.from('test file content'),
})

export const mockCloudinaryResponse = (overrides = {}) => ({
  public_id: 'test-public-id',
  version: 1234567890,
  signature: 'test-signature',
  width: 1920,
  height: 1080,
  format: 'jpg',
  resource_type: 'image',
  created_at: '2024-01-01T00:00:00Z',
  bytes: 1024 * 1024,
  type: 'upload',
  etag: 'test-etag',
  url: 'http://res.cloudinary.com/test/image/upload/v1234567890/test-public-id.jpg',
  secure_url: 'https://res.cloudinary.com/test/image/upload/v1234567890/test-public-id.jpg',
  folder: 'test-folder',
  original_filename: 'test',
  ...overrides,
})

export const mockPayloadRequest = (overrides = {}) => ({
  payload: {
    findByID: vi.fn(),
    find: vi.fn(),
  },
  user: {
    id: 'user-123',
    email: 'test@example.com',
    role: 'user',
  },
  headers: {},
  query: {},
  routeParams: {},
  json: vi.fn(() => Promise.resolve({})),
  ...overrides,
})

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})