/**
 * The message of an error. Cloudinary's SDK rejects with plain objects: the upload API with
 * `{ message, http_code }`, the Admin API with `{ error: { message, http_code } }`.
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  const rejection = error as { message?: unknown; error?: { message?: unknown } } | undefined
  if (typeof rejection?.message === 'string') return rejection.message
  if (typeof rejection?.error?.message === 'string') return rejection.error.message
  return String(error)
}
