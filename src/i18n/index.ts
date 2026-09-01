import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import lv from './locales/lv.json'

export const SUPPORTED_LOCALES = ['en', 'lv'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

const STORAGE_KEY = 'signbyte.locale'

function initialLocale(): Locale {
  // Only a non-secret UI preference is persisted client-side (never a token).
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) {
    return saved as Locale
  }
  const fallback = (import.meta.env.VITE_DEFAULT_LOCALE as Locale) ?? 'en'

  return fallback
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, lv },
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.setAttribute('lang', locale)
}
