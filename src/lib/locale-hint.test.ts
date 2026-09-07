import { describe, it, expect, beforeEach } from 'vitest'
import { i18n, setLocale } from '@/i18n'
import { applyLocaleHint, localeHint } from './locale-hint'

describe('localeHint', () => {
  it('names a supported locale, case-insensitively, from a plain or repeated query value', () => {
    expect(localeHint('lv')).toBe('lv')
    expect(localeHint('EN')).toBe('en')
    expect(localeHint(['lv', 'en'])).toBe('lv')
  })

  it('ignores an unknown or missing value', () => {
    expect(localeHint('de')).toBeNull()
    expect(localeHint('')).toBeNull()
    expect(localeHint(undefined)).toBeNull()
    expect(localeHint(null)).toBeNull()
  })
})

describe('applyLocaleHint', () => {
  beforeEach(() => {
    setLocale('en')
  })

  it('switches the app language and remembers it like a manual switch', () => {
    expect(applyLocaleHint('lv')).toBe('lv')
    expect(i18n.global.locale.value).toBe('lv')
    expect(localStorage.getItem('signbyte.locale')).toBe('lv')
    expect(document.documentElement.getAttribute('lang')).toBe('lv')
  })

  it('leaves the language alone on an unknown hint', () => {
    expect(applyLocaleHint('de')).toBeNull()
    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem('signbyte.locale')).toBe('en')
  })
})
