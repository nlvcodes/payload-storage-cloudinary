import { describe, expect, it } from 'vitest'
import { copyStoredRow } from '../../../helpers/storedDocument'

describe('copyStoredRow', () => {
  it('copies a __proto__ key as data, so a stored JSON value cannot set what the copy inherits', () => {
    const row = JSON.parse('{"meta":{"__proto__":{"locked":true}}}')

    const copy = copyStoredRow(row)

    expect(Object.getPrototypeOf(copy.meta)).toBe(Object.prototype)
    expect(copy.meta.locked).toBeUndefined()
    expect(Object.hasOwn(copy.meta, '__proto__')).toBe(true)
  })

  it('copies a plain JSON object that names a _bsontype, instead of sharing it', () => {
    const row = { extra: { _bsontype: 'ObjectId', locked: false } }

    const copy = copyStoredRow(row)

    expect(copy.extra).not.toBe(row.extra)
    expect(copy.extra).toEqual(row.extra)
  })
})
