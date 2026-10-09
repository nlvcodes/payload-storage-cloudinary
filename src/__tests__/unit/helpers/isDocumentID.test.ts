import { describe, expect, it } from 'vitest'
import { isDocumentID } from '../../../helpers/storedDocument'

describe('isDocumentID', () => {
  it('takes a number, as the SQL adapters use', () => {
    expect(isDocumentID(42)).toBe(true)
  })

  it('takes a string, as MongoDB and a custom ID use', () => {
    expect(isDocumentID('6650f1c2a1b2c3d4e5f60718')).toBe(true)
  })

  it('takes an empty string, which a caller that refuses it checks for itself', () => {
    expect(isDocumentID('')).toBe(true)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an object', { id: 42 }],
    ['an array', [42]],
    ['a boolean', true],
  ])('refuses %s', (_name, value) => {
    expect(isDocumentID(value)).toBe(false)
  })
})
