import type { Endpoint } from 'payload'
import { queueManager } from '../queue/queueManager.js'

export const createUploadStatusEndpoint = (collectionSlug: string): Endpoint => ({
  path: '/upload-status/:id?',
  method: 'get',
  handler: async (req) => {
    const queue = queueManager.getQueue(collectionSlug)
    const id = req.routeParams?.id as string | undefined
    
    if (id) {
      // Get status for specific upload
      const status = queue.getStatus(id)
      if (!status) {
        return Response.json({ error: 'Upload not found' }, { status: 404 })
      }
      
      return Response.json({
        id: status.id,
        filename: status.filename,
        size: status.size,
        progress: status.progress,
        status: status.status,
        error: status.error,
      })
    }
    
    // Get all upload statuses
    const allStatus = queue.getAllStatus()
    return Response.json({
      uploads: allStatus.map(status => ({
        id: status.id,
        filename: status.filename,
        size: status.size,
        progress: status.progress,
        status: status.status,
        error: status.error,
      })),
    })
  },
})

export const createCancelUploadEndpoint = (collectionSlug: string): Endpoint => ({
  path: '/upload-cancel/:id',
  method: 'post',
  handler: async (req) => {
    const queue = queueManager.getQueue(collectionSlug)
    const id = req.routeParams?.id as string | undefined
    
    if (!id) {
      return Response.json({ error: 'Upload ID required' }, { status: 400 })
    }
    
    const cancelled = queue.cancelUpload(id)
    
    if (cancelled) {
      return Response.json({ success: true, message: 'Upload cancelled' })
    } else {
      return Response.json({ 
        success: false, 
        message: 'Unable to cancel upload. It may have already started or completed.' 
      }, { status: 400 })
    }
  },
})