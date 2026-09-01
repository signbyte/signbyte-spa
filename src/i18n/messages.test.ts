import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import lv from './locales/lv.json'

// vue-i18n compiles each message lazily on first t() — so a reserved character in a
// string (an unescaped '@' linked-message prefix, a stray '{'/'}'/'|') only blows up
// at render time, blanking the screen. This walks every leaf key and resolves it, so
// any message that fails to compile is caught here, in the gate, not in the browser.
function leafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') keys.push(...leafKeys(v as Record<string, unknown>, path))
    else keys.push(path)
  }

  return keys
}

describe('i18n messages compile', () => {
  const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en, lv } })
  const t = i18n.global.t

  for (const locale of ['en', 'lv'] as const) {
    it(`every ${locale} message resolves without a compile error`, () => {
      i18n.global.locale.value = locale
      const keys = leafKeys((locale === 'en' ? en : lv) as Record<string, unknown>)
      expect(keys.length).toBeGreaterThan(0)
      for (const key of keys) {
        // A reserved-char message throws here rather than returning a string.
        expect(() => t(key, { n: 1, loa: 'high', signed: 1, total: 2 }, 1)).not.toThrow()
      }
    })
  }

  it('en and lv have the same set of keys (no missing translations)', () => {
    expect(leafKeys(en as Record<string, unknown>).sort()).toEqual(leafKeys(lv as Record<string, unknown>).sort())
  })
})
