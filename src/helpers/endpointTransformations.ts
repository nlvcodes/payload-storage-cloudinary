/**
 * The transformations a caller may ask the signed-URL endpoints, and by default the server
 * helpers, to sign.
 *
 * The endpoints sign whatever reaches `cloudinary.url()`, and the SDK can turn a caller's object
 * into far more than a resize. `overlay` and `underlay` become `l_` and `u_` layers that name
 * another asset (`l_authenticated:<public id>`), `default_image` becomes `d_<public id>`,
 * `transformation` becomes a named transformation (`t_`), `raw_transformation` is appended as is,
 * `$`-prefixed keys and `variables` define variables, and `if` adds a condition. A value is
 * written into the URL unescaped, so `/` starts a new segment, `,` a new component, `:` a
 * qualifier such as a layer's delivery type, and `$` a variable.
 *
 * So the endpoints accept only the keys below, which size, crop and encode the document's own
 * asset, and each value must be a finite number or a short token of letters, digits, `_` and `.`.
 * A token like that cannot add a segment, a component, a layer, a variable or a named
 * transformation. Anything else is refused, and the endpoint signs nothing.
 *
 * The server helpers (serverHelpers.ts) run the same check unless trusted server code passes
 * `overrideTransformationAllowlist: true`.
 */
export const ALLOWED_TRANSFORMATION_KEYS = [
  'width',
  'height',
  'crop',
  'gravity',
  'quality',
  'fetch_format',
  'dpr',
  'aspect_ratio',
] as const

export type AllowedTransformations = Partial<
  Record<(typeof ALLOWED_TRANSFORMATION_KEYS)[number], string | number>
>

export type TransformationsResult =
  | { ok: true; transformations: AllowedTransformations | undefined }
  | { ok: false; error: string }

const ALLOWED_KEYS = new Set<string>(ALLOWED_TRANSFORMATION_KEYS)

const TOKEN = /^[A-Za-z0-9_.]{1,32}$/

const REFUSED_KEY = `Transformations accept only these keys: ${ALLOWED_TRANSFORMATION_KEYS.join(', ')}`
const REFUSED_VALUE =
  'Each transformation value must be a number or up to 32 letters, digits, "_" and "."'
const REFUSED_SHAPE = 'Transformations must be an object of keys and values'

/**
 * Checks the `transformations` a caller sent in a request body. Absent means none. Anything but
 * an object of allowed keys and safe values is refused.
 */
export function checkTransformations(value: unknown): TransformationsResult {
  if (value === undefined || value === null) return { ok: true, transformations: undefined }
  if (!isPlainObject(value)) return { ok: false, error: REFUSED_SHAPE }

  const transformations: AllowedTransformations = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: REFUSED_KEY }
    if (!isSafeValue(entry)) return { ok: false, error: REFUSED_VALUE }
    transformations[key as keyof AllowedTransformations] = entry
  }
  return { ok: true, transformations }
}

/**
 * Reads the `transformations` query parameter, in any of its three forms, and checks it the same
 * way as a request body:
 * - JSON: `{"width":300,"crop":"fill"}`
 * - comma-separated `key:value` pairs: `width:300,crop:fill`
 * - bracketed keys, which Payload parses into an object: `transformations[width]=300`
 */
export function transformationsFromQuery(param: unknown): TransformationsResult {
  if (param === undefined || param === null || param === '') {
    return { ok: true, transformations: undefined }
  }
  if (typeof param !== 'string') return checkTransformations(param)

  let parsed: unknown
  try {
    parsed = JSON.parse(param)
  } catch {
    parsed = fromCommaList(param)
    if (parsed === undefined) return { ok: false, error: REFUSED_SHAPE }
  }
  return checkTransformations(parsed)
}

/**
 * Parses `width:300,crop:fill`. Each pair is one key and one value. A pair with no `:`, more than
 * one `:`, or an empty side makes the whole list invalid, so a value can't smuggle a qualifier.
 */
function fromCommaList(list: string): Record<string, string | number> | undefined {
  const result: Record<string, string | number> = {}
  for (const pair of list.split(',')) {
    const parts = pair.split(':')
    if (parts.length !== 2) return undefined
    const key = parts[0].trim()
    const value = parts[1].trim()
    if (!key || !value) return undefined
    const number = Number(value)
    result[key] = Number.isNaN(number) ? value : number
  }
  return result
}

function isSafeValue(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value) && TOKEN.test(String(value))
  return typeof value === 'string' && TOKEN.test(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
