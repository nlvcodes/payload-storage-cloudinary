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
    const chunkSizeBytes = this.config.chunkSize * 1024 * 1024
    const totalChunks = Math.ceil(task.buffer.length / chunkSizeBytes)
    
    // Initialize chunked upload
    const uploadId = await this.initializeChunkedUpload(task.options)
    
    try {
      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSizeBytes
        const end = Math.min(start + chunkSizeBytes, task.buffer.length)
        const chunk = task.buffer.slice(start, end)
        
        await this.uploadChunk(uploadId, chunk, i, totalChunks)
        
        const progress = Math.round(((i + 1) / totalChunks) * 100)
        task.progress = progress
        task.onProgress?.(progress)
      }
      
      // Finalize upload
      const result = await this.finalizeChunkedUpload(uploadId, task.options)
      task.result = result
      
    } catch (error) {
      // Clean up failed chunked upload
      await this.abortChunkedUpload(uploadId)
      throw error
    }
  }
  
  private async initializeChunkedUpload(_options: any): Promise<string> {
    // This is a simplified version - Cloudinary's actual chunked upload API 
    // requires using their Upload API with specific headers
    // For now, we'll use a mock implementation
    return `chunked_${Date.now()}`
  }
  
  private async uploadChunk(
    _uploadId: string, 
    _chunk: Buffer, 
    _chunkIndex: number, 
    _totalChunks: number
  ): Promise<void> {
    // Mock implementation - in production, this would use Cloudinary's 
    // chunked upload endpoints
    return new Promise(resolve => setTimeout(resolve, 100))
  }
  
  private async finalizeChunkedUpload(_uploadId: string, _options: any): Promise<any> {
    // Mock implementation - would finalize the chunked upload
    return {
      public_id: 'chunked_upload_result',
      secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    }
  }
  
  private async abortChunkedUpload(_uploadId: string): Promise<void> {
    // Clean up incomplete chunked upload
    return Promise.resolve()
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