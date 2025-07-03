import { UploadQueue } from './uploadQueue.js'
import type { UploadQueueConfig } from '../types.js'

class QueueManager {
  private queues: Map<string, UploadQueue> = new Map()
  
  getQueue(collectionSlug: string, config?: UploadQueueConfig): UploadQueue {
    if (!this.queues.has(collectionSlug)) {
      this.queues.set(collectionSlug, new UploadQueue(config))
    }
    return this.queues.get(collectionSlug)!
  }
  
  removeQueue(collectionSlug: string): void {
    this.queues.delete(collectionSlug)
  }
  
  getAllQueues(): Map<string, UploadQueue> {
    return new Map(this.queues)
  }
}

// Singleton instance
export const queueManager = new QueueManager()