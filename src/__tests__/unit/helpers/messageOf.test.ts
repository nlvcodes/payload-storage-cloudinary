import { describe, expect, it } from 'vitest'
import { messageOf } from '../../../helpers/errorMessage'

describe('messageOf', () => {
  it("returns an Error's message", () => {
    expect(messageOf(new Error('Rename failed'))).toBe('Rename failed')
  })

  it('unwraps the upload API rejection, a plain { message, http_code }', () => {
    expect(messageOf({ message: 'Resource not found', http_code: 404 })).toBe('Resource not found')
  })

  it('unwraps the Admin API rejection, a plain { error: { message, http_code } }', () => {
    expect(messageOf({ error: { message: 'Rate limited', http_code: 420 } })).toBe('Rate limited')
  })

  it('turns anything else into a string', () => {
    expect(messageOf('a thrown string')).toBe('a thrown string')
    expect(messageOf(undefined)).toBe('undefined')
    expect(messageOf({ message: 42 })).toBe('[object Object]')
  })
})
