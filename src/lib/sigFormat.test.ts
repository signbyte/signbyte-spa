import { describe, it, expect } from 'vitest'
import { isPdf, deriveSigFormat } from './sigFormat'

describe('sigFormat', () => {
  it('recognizes a PDF by its exact mime type', () => {
    expect(isPdf('application/pdf')).toBe(true)
    expect(isPdf('application/msword')).toBe(false)
    expect(isPdf('image/png')).toBe(false)
  })

  it('signs a non-PDF as XAdES regardless of the container toggle', () => {
    expect(deriveSigFormat('image/png', false)).toBe('XAdES')
    expect(deriveSigFormat('image/png', true)).toBe('XAdES')
  })

  it('signs a PDF natively as PAdES by default', () => {
    expect(deriveSigFormat('application/pdf', false)).toBe('PAdES')
  })

  it('wraps a PDF into an ASiC-E container as XAdES when the toggle is on', () => {
    expect(deriveSigFormat('application/pdf', true)).toBe('XAdES')
  })
})
