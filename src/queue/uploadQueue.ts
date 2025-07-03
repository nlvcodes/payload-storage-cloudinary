import type { UploadQueueConfig } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'

export interface UploadTask {
  id: string
  filename: string
  buffer: Buffer
  size: number
  options: any
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  error?: string
  result?: any
  onProgress?: (progress: number) => void
  onComplete?: (result: any) => void
  onError?: (error: Error) => void
}

export class UploadQueue {
  private queue: UploadTask[] = []
  private activeUploads: Map<string, UploadTask> = new Map()
  private config: Required<UploadQueueConfig>
  
  constructor(config: UploadQueueConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      maxConcurrentUploads: config.maxConcurrentUploads ?? 3,
      chunkSize: config.chunkSize ?? 20, // 20MB chunks
      enableChunkedUploads: config.enableChunkedUploads ?? true,
      largeFileThreshold: config.largeFileThreshold ?? 100, // 100MB
    }
  }
  
  async addUpload(task: Omit<UploadTask, 'id' | 'progress' | 'status'>): Promise<string> {
    const id = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const uploadTask: UploadTask = {
      ...task,
      id,
      progress: 0,
      status: 'pending',
    }
    
    this.queue.push(uploadTask)
    this.processQueue()
    
    return id
  }
  
  private async processQueue() {
    while (
      this.queue.length > 0 && 
      this.activeUploads.size < this.config.maxConcurrentUploads
    ) {
      const task = this.queue.shift()
      if (!task) continue
      
      task.status = 'uploading'
      this.activeUploads.set(task.id, task)
      
      // Process upload asynchronously
      this.processUpload(task).catch(error => {
        task.status = 'failed'
        task.error = error.message
        task.onError?.(error)
        this.activeUploads.delete(task.id)
        this.processQueue()
      })
    }
  }
  
  private async processUpload(task: UploadTask) {
    try {
      const isLargeFile = task.size > this.config.largeFileThreshold * 1024 * 1024
      
      if (isLargeFile && this.config.enableChunkedUploads) {
        // Use chunked upload for large files
        await this.chunkedUpload(task)
      } else {
        // Use regular upload
        await this.regularUpload(task)
      }
      
      task.status = 'completed'
      task.progress = 100
      task.onProgress?.(100)
      task.onComplete?.(task.result)
      
    } finally {
      this.activeUploads.delete(task.id)
      this.processQueue()
    }
  }
  
  private async regularUpload(task: UploadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        task.options,
        (error, result) => {
          if (error) {
            reject(error)
          } else {
            task.result = result
            resolve()
          }
        }
      )
      
      // Track upload progress
      let uploaded = 0
      const totalSize = task.buffer.length
      
      uploadStream.on('pipe', () => {
        task.onProgress?.(0)
      })
      
      uploadStream.on('data', (chunk) => {
        uploaded += chunk.length
        const progress = Math.round((uploaded / totalSize) * 100)
        task.progress = progress
        task.onProgress?.(progress)
      })
      
      uploadStream.end(task.buffer)
    })
  }
  
  private async chunkedUpload(task: UploadTask): Promise<void> {
    // Use Cloudinary's upload_large_stream for files over threshold
    const { Readable } = await import('stream')
    
    return new Promise((resolve, reject) => {
      // Create a readable stream from the buffer
      const bufferStream = new Readable()
      bufferStream.push(task.buffer)
      bufferStream.push(null)
      
      // Use upload_large_stream which handles chunking automatically
      const uploadStream = cloudinary.uploader.upload_large_stream(
        {
          ...task.options,
          chunk_size: this.config.chunkSize * 1024 * 1024,
        },
        (error, result) => {
          if (error) {
            const errorMsg = error.message || 'Unknown error'
            if (errorMsg.includes('413') || errorMsg.includes('File size too large')) {
              reject(new Error('File too large for your Cloudinary plan. Consider upgrading for larger file support.'))
            } else {
              reject(error)
            }
          } else {
            task.result = result
            resolve()
          }
        }
      )
      
      // Track progress (approximate since we can't track chunks directly)
      let uploaded = 0
      const totalSize = task.buffer.length
      
      uploadStream.on('pipe', () => {
        task.onProgress?.(0)
      })
      
      uploadStream.on('data', (chunk: Buffer) => {
        uploaded += chunk.length
        const progress = Math.min(Math.round((uploaded / totalSize) * 90), 90) // Cap at 90% until complete
        task.progress = progress
        task.onProgress?.(progress)
      })
      
      uploadStream.on('finish', () => {
        task.progress = 100
        task.onProgress?.(100)
      })
      
      // Pipe the buffer stream to the upload stream
      bufferStream.pipe(uploadStream)
    })
  }
  
  
  getStatus(uploadId: string): UploadTask | undefined {
    return this.activeUploads.get(uploadId) || 
           this.queue.find(task => task.id === uploadId)
  }
  
  getAllStatus(): UploadTask[] {
    return [...this.queue, ...Array.from(this.activeUploads.values())]
  }
  
  cancelUpload(uploadId: string): boolean {
    // Remove from queue if pending
    const queueIndex = this.queue.findIndex(task => task.id === uploadId)
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1)
      return true
    }
    
    // Can't cancel active uploads in this implementation
    return false
  }
}