import { Writable } from 'node:stream'
import { vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'

// The Cloudinary SDK methods the plugin calls that make a network call: the upload API, plus
// the Admin API methods it uses for derived resources, folders and asset lookups. All of them are mocked, so
// no test reaches the network. cloudinary.url() and cloudinary.utils stay real: they only build
// and sign strings.
// The plugin also calls uploader.upload_large_stream for files over 100MB, but cloudinary@2
// has no such method, so that call throws in the real SDK and is left unmocked here.
const UPLOAD_API_METHODS = ['upload', 'upload_stream', 'rename', 'destroy', 'explicit'] as const
const ADMIN_API_METHODS = [
  'delete_derived_resources',
  'root_folders',
  'sub_folders',
  'resource',
] as const

export type UploadApiMethod = (typeof UPLOAD_API_METHODS)[number]
export type AdminApiMethod = (typeof ADMIN_API_METHODS)[number]
/** The methods a test can make fail. */
export type FailableMethod = Extract<UploadApiMethod | AdminApiMethod, 'rename' | 'resource'>

export type CloudinaryCall = {
  method: UploadApiMethod | AdminApiMethod
  /**
   * The public ID an upload API call, or an Admin API asset lookup, targets. For uploads, the
   * public ID Cloudinary assigned.
   */
  publicId?: string
  options: Record<string, any>
  /** The positional arguments of an Admin API call, callbacks left out. */
  args?: unknown[]
  /** Bytes received, for upload_stream. */
  bytes?: number
  result: Record<string, any>
  /** What the call rejected with, for a call made to fail with `failOn`. */
  error?: Error | Record<string, any>
}

/**
 * A failure `failOn` injects: what Cloudinary answers, rejected in the SDK's shape for the method,
 * or an Error the SDK throws as is. The upload API rejects with `{ message, name, http_code }`,
 * the Admin API with `{ error: { message, http_code }, request_options, query_params }`.
 */
export type CloudinaryFailure = { message: string; httpCode?: number } | Error

export type CloudinaryApiMock = {
  /** Every upload API and Admin API call, in order. */
  calls: CloudinaryCall[]
  /**
   * Makes later `method` calls on `publicId` fail with `failure`, as Cloudinary would. The first
   * `skip` calls go through. Then `times` calls fail, or every later call when `times` is left out.
   * With `type`, only calls for that delivery type fail.
   */
  failOn: (
    method: FailableMethod,
    publicId: string,
    failure: CloudinaryFailure,
    when?: { skip?: number; times?: number; type?: string },
  ) => void
  restore: () => void
}

type Callback = (error: unknown, result?: Record<string, any>) => void

export function mockCloudinaryApi(): CloudinaryApiMock {
  const calls: CloudinaryCall[] = []
  const failures = new Map<
    string,
    { error: Error | Record<string, any>; skip: number; times?: number }
  >()
  const failureKey = (method: string, publicId?: string, type?: string) =>
    type ? `${method}:${publicId}:${type}` : `${method}:${publicId}`
  let assetCount = 0

  // The shape of an upload response, limited to the fields the plugin reads.
  const assetResult = (publicId: string, options: Record<string, any>, bytes = 0) => {
    const type: string = options.type ?? 'upload'
    const resourceType: string =
      !options.resource_type || options.resource_type === 'auto' ? 'image' : options.resource_type
    const version = 1700000000 + assetCount
    const format = 'png'
    const deliveryOptions = { type, resource_type: resourceType, version, format }

    return {
      public_id: publicId,
      version,
      type,
      resource_type: resourceType,
      format,
      bytes,
      width: 1,
      height: 1,
      ...(options.folder ? { folder: options.folder } : {}),
      // Cloudinary signs the delivery URL of an authenticated upload.
      url: cloudinary.url(publicId, { ...deliveryOptions, sign_url: type === 'authenticated' }),
      secure_url: cloudinary.url(publicId, {
        ...deliveryOptions,
        secure: true,
        sign_url: type === 'authenticated',
      }),
    }
  }

  const newPublicId = (options: Record<string, any>) => {
    assetCount += 1
    if (options.public_id) {
      return options.folder ? `${options.folder}/${options.public_id}` : options.public_id
    }
    return options.folder ? `${options.folder}/asset-${assetCount}` : `asset-${assetCount}`
  }

  // The error the next call on this key fails with, or undefined when it goes through.
  const nextFailure = (key: string) => {
    const failure = failures.get(key)
    if (!failure) return undefined
    if (failure.skip > 0) {
      failure.skip -= 1
      return undefined
    }
    if (failure.times === undefined) return failure.error
    if (failure.times === 0) return undefined
    failure.times -= 1
    return failure.error
  }

  const record = (call: CloudinaryCall, callback?: Callback) => {
    const error =
      nextFailure(failureKey(call.method, call.publicId, call.options.type)) ??
      nextFailure(failureKey(call.method, call.publicId))
    if (error) {
      calls.push({ ...call, result: {}, error })
      callback?.(error)
      throw error
    }
    calls.push(call)
    callback?.(undefined, call.result)
    return call.result
  }

  // The SDK accepts (options, callback), (null, callback) and (callback) for upload_stream.
  const streamUpload = (optionsOrCallback?: unknown, maybeCallback?: unknown) => {
    const options = (
      optionsOrCallback && typeof optionsOrCallback === 'object' ? optionsOrCallback : {}
    ) as Record<string, any>
    const callback = (
      typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
    ) as Callback | undefined
    const chunks: Buffer[] = []

    return new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk))
        done()
      },
      final(done) {
        const bytes = Buffer.concat(chunks).length
        const publicId = newPublicId(options)
        record(
          {
            method: 'upload_stream',
            publicId,
            options,
            bytes,
            result: assetResult(publicId, options, bytes),
          },
          callback,
        )
        done()
      },
    })
  }

  const implementations: Record<UploadApiMethod, (...args: any[]) => unknown> = {
    upload_stream: streamUpload,
    // The SDK accepts (file, options, callback) and (file, callback).
    upload: async (_file: unknown, optionsOrCallback?: unknown, maybeCallback?: Callback) => {
      const options = (
        optionsOrCallback && typeof optionsOrCallback === 'object' ? optionsOrCallback : {}
      ) as Record<string, any>
      const callback =
        typeof optionsOrCallback === 'function' ? (optionsOrCallback as Callback) : maybeCallback
      const publicId = newPublicId(options)
      return record(
        { method: 'upload', publicId, options, result: assetResult(publicId, options) },
        callback,
      )
    },
    rename: async (
      from: string,
      to: string,
      options: Record<string, any> = {},
      callback?: Callback,
    ) => {
      const type = options.to_type ?? options.type ?? 'upload'
      return record(
        {
          method: 'rename',
          publicId: from,
          options: { ...options, to },
          result: assetResult(to, { ...options, type }),
        },
        callback,
      )
    },
    destroy: async (publicId: string, options: Record<string, any> = {}, callback?: Callback) =>
      record({ method: 'destroy', publicId, options, result: { result: 'ok' } }, callback),
    explicit: async (publicId: string, options: Record<string, any> = {}, callback?: Callback) =>
      record(
        { method: 'explicit', publicId, options, result: assetResult(publicId, options) },
        callback,
      ),
  }

  // The Admin API takes its callback in different positions, so find it by type.
  const adminCall =
    (method: AdminApiMethod, result: Record<string, any>) =>
    async (...rawArgs: unknown[]) => {
      const args = rawArgs.filter((arg) => typeof arg !== 'function')
      const callback = rawArgs.find((arg) => typeof arg === 'function') as Callback | undefined
      const options = (args.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg)) ??
        {}) as Record<string, any>
      return record({ method, options, args, result: { ...result } }, callback)
    }

  const adminImplementations: Record<AdminApiMethod, (...args: any[]) => unknown> = {
    delete_derived_resources: adminCall('delete_derived_resources', { deleted: {} }),
    root_folders: adminCall('root_folders', { folders: [], total_count: 0 }),
    sub_folders: adminCall('sub_folders', { folders: [], total_count: 0 }),
    // The SDK accepts (public_id, options, callback) and (public_id, callback). By default the
    // asset exists, with the type and resource type the call asks for.
    resource: async (publicId: string, optionsOrCallback?: unknown, maybeCallback?: Callback) => {
      const options = (
        optionsOrCallback && typeof optionsOrCallback === 'object' ? optionsOrCallback : {}
      ) as Record<string, any>
      const callback =
        typeof optionsOrCallback === 'function' ? (optionsOrCallback as Callback) : maybeCallback
      return record(
        {
          method: 'resource',
          publicId,
          options,
          args: [publicId, options],
          result: assetResult(publicId, options),
        },
        callback,
      )
    },
  }

  const spies = [
    ...UPLOAD_API_METHODS.map((method) =>
      vi.spyOn(cloudinary.uploader as any, method).mockImplementation(implementations[method]),
    ),
    ...ADMIN_API_METHODS.map((method) =>
      vi.spyOn(cloudinary.api as any, method).mockImplementation(adminImplementations[method]),
    ),
  ]

  return {
    calls,
    failOn: (method, publicId, failure, when) => {
      failures.set(failureKey(method, publicId, when?.type), {
        error: rejectionOf(method, failure),
        skip: when?.skip ?? 0,
        times: when?.times,
      })
    },
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  }
}

// The value the SDK rejects with for a failed call, as cloudinary@2 builds it.
function rejectionOf(method: FailableMethod, failure: CloudinaryFailure) {
  if (failure instanceof Error) return failure
  const http_code = failure.httpCode ?? 400
  if ((ADMIN_API_METHODS as readonly string[]).includes(method)) {
    return { error: { message: failure.message, http_code }, request_options: {}, query_params: {} }
  }
  return { message: failure.message, name: 'Error', http_code }
}
