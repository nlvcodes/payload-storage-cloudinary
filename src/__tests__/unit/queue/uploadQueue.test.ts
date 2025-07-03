import { describe, it, expect, vi, beforeEach } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { UploadQueue } from '../../../queue/uploadQueue'
import type { UploadQueueConfig } from '../../../types'

describe('UploadQueue', () => {
  let queue: UploadQueue
  
  beforeEach(() => {
    vi.clearAllMocks()
    queue = new UploadQueue({
      maxConcurrentUploads: 2,
      chunkSize: 20,
      enableChunkedUploads: true,
      largeFileThreshold: 100,
    })
  })

  describe('queue management', () => {
    it('should add uploads to queue', () => {
      const task1 = {
        filename: 'file1.jpg',
        buffer: Buffer.from('content1'),
        size: 1024,
        options: {},
      }
      
      const task2 = {
        filename: 'file2.jpg',
        buffer: Buffer.from('content2'),
        size: 2048,
        options: {},
      }

      queue.addUpload(task1)
      queue.addUpload(task2)

      const status = queue.getAllStatus()
      expect(status).toHaveLength(2)
      expect(status[0].filename).toBe('file1.jpg')
      expect(status[1].filename).toBe('file2.jpg')
    })

    it('should respect max concurrent uploads', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      // Mock regular uploads to take time
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, { public_id: 'test' } as any), 100)
          return uploadStream as any
        }
      )

      // Add 3 uploads when max concurrent is 2
      const uploads = Array.from({ length: 3 }, (_, i) => ({
        filename: `file${i}.jpg`,
        buffer: Buffer.from(`content${i}`),
        size: 1024,
        options: {},
      }))

      const promises = uploads.map(upload => 
        new Promise((resolve) => {
          queue.addUpload({
            ...upload,
            onComplete: resolve,
          })
        })
      )

      // Wait a bit for queue to start processing
      await new Promise(resolve => setTimeout(resolve, 50))

      // Check that only 2 are active
      const activeCount = queue.getAllStatus()
        .filter(task => task.status === 'uploading').length
      expect(activeCount).toBe(2)

      // Wait for all to complete
      await Promise.all(promises)
      
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledTimes(3)
    })

    it('should cancel pending uploads', () => {
      const task = {
        filename: 'file.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      }

      queue.addUpload(task)
      const status = queue.getAllStatus()
      const uploadId = status[0].id

      const cancelled = queue.cancelUpload(uploadId)
      expect(cancelled).toBe(true)

      const newStatus = queue.getAllStatus()
      expect(newStatus).toHaveLength(0)
    })
  })

  describe('regular upload', () => {
    it('should upload small files normally', async () => {
      const mockResponse = { public_id: 'test-id', secure_url: 'https://test.com/image.jpg' }
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, mockResponse as any), 0)
          return uploadStream as any
        }
      )

      const onProgress = vi.fn()
      const onComplete = vi.fn()
      const onError = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'small.jpg',
          buffer: Buffer.from('small content'),
          size: 50 * 1024 * 1024, // 50MB
          options: { folder: 'test' },
          onProgress,
          onComplete: (result) => {
            onComplete(result)
            resolve()
          },
          onError,
        })
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        { folder: 'test' },
        expect.any(Function)
      )
      expect(onComplete).toHaveBeenCalledWith(mockResponse)
      expect(onError).not.toHaveBeenCalled()
    })

    it('should handle upload errors', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(new Error('Upload failed'), null), 0)
          return uploadStream as any
        }
      )

      const onError = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'error.jpg',
          buffer: Buffer.from('content'),
          size: 1024,
          options: {},
          onError: (error) => {
            onError(error)
            resolve()
          },
        })
      })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onError.mock.calls[0][0].message).toBe('Upload failed')
    })
  })

  describe('chunked upload', () => {
    it('should use upload_large_stream for large files', async () => {
      const mockResponse = { public_id: 'large-file-id' }
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn((event, handler) => {
          if (event === 'finish') {
            setTimeout(handler, 0)
          }
        }),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, mockResponse as any), 0)
          return uploadStream as any
        }
      )

      const onComplete = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'large.mp4',
          buffer: Buffer.from('x'.repeat(150 * 1024 * 1024)), // 150MB
          size: 150 * 1024 * 1024,
          options: { resource_type: 'video' },
          onComplete: (result) => {
            onComplete(result)
            resolve()
          },
        })
      })

      expect(cloudinary.uploader.upload_large_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'video',
          chunk_size: 20 * 1024 * 1024,
        }),
        expect.any(Function)
      )
      expect(onComplete).toHaveBeenCalledWith(mockResponse)
    })

    it('should handle chunked upload errors', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(new Error('File too large'), null), 0)
          return uploadStream as any
        }
      )

      const onError = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'huge.mp4',
          buffer: Buffer.from('x'.repeat(500 * 1024 * 1024)), // 500MB
          size: 500 * 1024 * 1024,
          options: {},
          onError: (error) => {
            onError(error)
            resolve()
          },
        })
      })

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('File too large'),
        })
      )
    })

    it('should track progress for large uploads', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn((event, handler) => {
          // Simulate progress events
          if (event === 'data') {
            handler(Buffer.from('x'.repeat(1024)))
          }
          if (event === 'finish') {
            setTimeout(handler, 0)
          }
        }),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, { public_id: 'test' } as any), 50)
          return uploadStream as any
        }
      )

      const onProgress = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'large-with-progress.mp4',
          buffer: Buffer.from('x'.repeat(200 * 1024 * 1024)), // 200MB
          size: 200 * 1024 * 1024,
          options: {},
          onProgress,
          onComplete: () => resolve(),
        })
      })

      expect(onProgress).toHaveBeenCalled()
      // Progress should have been called with values between 0 and 100
      const progressValues = onProgress.mock.calls.map(call => call[0])
      expect(progressValues.some(v => v > 0 && v <= 100)).toBe(true)
    })
  })

  describe('queue status', () => {
    it('should get status by upload ID', () => {
      const task = {
        filename: 'status-test.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      }

      queue.addUpload(task)
      const allStatus = queue.getAllStatus()
      const uploadId = allStatus[0].id

      const status = queue.getStatus(uploadId)
      expect(status).toBeDefined()
      expect(status?.filename).toBe('status-test.jpg')
      expect(status?.status).toBe('pending')
    })

    it('should return undefined for non-existent upload ID', () => {
      const status = queue.getStatus('non-existent-id')
      expect(status).toBeUndefined()
    })

    it('should clear completed uploads', () => {
      const task = {
        filename: 'clear-test.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      }

      queue.addUpload(task)
      const cleared = queue.clearCompleted()
      expect(cleared).toBe(0) // Nothing completed yet

      // TODO: Test clearing after uploads complete
    })
  })
})