import { describe, it, expect, vi, beforeEach } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { UploadQueue } from '../../../queue/uploadQueue'

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
    it('should add uploads to queue and return an ID', async () => {
      // Make upload_stream never resolve so tasks stay in queue/active
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        () => ({ end: vi.fn(), on: vi.fn(), pipe: vi.fn() }) as any,
      )

      const id1 = await queue.addUpload({
        filename: 'file1.jpg',
        buffer: Buffer.from('content1'),
        size: 1024,
        options: {},
      })

      const id2 = await queue.addUpload({
        filename: 'file2.jpg',
        buffer: Buffer.from('content2'),
        size: 2048,
        options: {},
      })

      expect(typeof id1).toBe('string')
      expect(typeof id2).toBe('string')
      expect(id1).not.toBe(id2)
    })

    it('should respect max concurrent uploads', async () => {
      // Make uploads that never complete so we can observe concurrency
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        () => ({ end: vi.fn(), on: vi.fn(), pipe: vi.fn() }) as any,
      )

      // Add 3 uploads when max concurrent is 2
      await queue.addUpload({
        filename: 'file0.jpg',
        buffer: Buffer.from('content0'),
        size: 1024,
        options: {},
      })
      await queue.addUpload({
        filename: 'file1.jpg',
        buffer: Buffer.from('content1'),
        size: 1024,
        options: {},
      })
      await queue.addUpload({
        filename: 'file2.jpg',
        buffer: Buffer.from('content2'),
        size: 1024,
        options: {},
      })

      // Wait a tick for queue processing
      await new Promise((resolve) => setTimeout(resolve, 10))

      // upload_stream should have been called only twice (max concurrent = 2)
      // The third should be queued
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledTimes(2)
    })

    it('should cancel pending uploads that have not started', async () => {
      // Make uploads that never complete
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        () => ({ end: vi.fn(), on: vi.fn(), pipe: vi.fn() }) as any,
      )

      // Fill the max concurrent slots
      await queue.addUpload({
        filename: 'active1.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      })
      await queue.addUpload({
        filename: 'active2.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      })

      // This one should be queued (pending), not active
      await queue.addUpload({
        filename: 'pending.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Find the pending task
      const allStatus = queue.getAllStatus()
      const pendingTask = allStatus.find((t) => t.filename === 'pending.jpg')

      if (pendingTask) {
        const cancelled = queue.cancelUpload(pendingTask.id)
        expect(cancelled).toBe(true)
      }
    })
  })

  describe('regular upload', () => {
    it('should upload small files normally', async () => {
      const mockResponse = {
        public_id: 'test-id',
        secure_url: 'https://test.com/image.jpg',
      }

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const onComplete = vi.fn()
      const onError = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'small.jpg',
          buffer: Buffer.from('small content'),
          size: 50 * 1024 * 1024, // 50MB - under threshold
          options: { folder: 'test' },
          onComplete: (result) => {
            onComplete(result)
            resolve()
          },
          onError,
        })
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        { folder: 'test' },
        expect.any(Function),
      )
      expect(onComplete).toHaveBeenCalledWith(mockResponse)
      expect(onError).not.toHaveBeenCalled()
    })

    it('should handle upload errors', async () => {
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(new Error('Upload failed'), null), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
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

      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          // Must implement write/end for pipe() to work
          return {
            write: vi.fn(() => true),
            end: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn(),
            removeListener: vi.fn(),
          } as any
        },
      )

      const onComplete = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'large.mp4',
          buffer: Buffer.from('large file placeholder'),
          size: 150 * 1024 * 1024, // 150MB - over 100MB threshold
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
        expect.any(Function),
      )
      expect(onComplete).toHaveBeenCalledWith(mockResponse)
    })

    it('should handle chunked upload errors', async () => {
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(new Error('File too large'), null), 0)
          return {
            write: vi.fn(() => true),
            end: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn(),
            removeListener: vi.fn(),
          } as any
        },
      )

      const onError = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'huge.mp4',
          buffer: Buffer.from('huge file placeholder'),
          size: 500 * 1024 * 1024, // 500MB
          options: {},
          onError: (error) => {
            onError(error)
            resolve()
          },
        })
      })

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should track progress for large uploads', async () => {
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, { public_id: 'test' }), 50)
          return {
            write: vi.fn(() => true),
            end: vi.fn(),
            on: vi.fn((event: string, handler: any) => {
              if (event === 'data') {
                handler(Buffer.from('x'.repeat(1024)))
              }
              if (event === 'finish') {
                setTimeout(handler, 10)
              }
            }),
            once: vi.fn(),
            emit: vi.fn(),
            removeListener: vi.fn(),
          } as any
        },
      )

      const onProgress = vi.fn()

      await new Promise<void>((resolve) => {
        queue.addUpload({
          filename: 'large-with-progress.mp4',
          buffer: Buffer.from('progress tracking placeholder'),
          size: 200 * 1024 * 1024, // 200MB
          options: {},
          onProgress,
          onComplete: () => resolve(),
        })
      })

      expect(onProgress).toHaveBeenCalled()
    })
  })

  describe('queue status', () => {
    it('should get status by upload ID for active uploads', async () => {
      // Make upload never complete so it stays active
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        () => ({ end: vi.fn(), on: vi.fn(), pipe: vi.fn() }) as any,
      )

      const uploadId = await queue.addUpload({
        filename: 'status-test.jpg',
        buffer: Buffer.from('content'),
        size: 1024,
        options: {},
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const status = queue.getStatus(uploadId)
      expect(status).toBeDefined()
      expect(status?.filename).toBe('status-test.jpg')
    })

    it('should return undefined for non-existent upload ID', () => {
      const status = queue.getStatus('non-existent-id')
      expect(status).toBeUndefined()
    })

    it('should clear completed uploads', () => {
      const cleared = queue.clearCompleted()
      expect(cleared).toBe(0) // Nothing completed yet
    })
  })
})
