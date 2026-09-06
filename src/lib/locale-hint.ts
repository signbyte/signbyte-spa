// A signing link may name the language the requester asked for (`?lang=lv|en` on the
// envelope URL). The hint is applied once and remembered exactly like a manual switch
// in the shell; an unknown value is ignored rather than refused — the link still opens.
import type { LocationQueryValue } from 'vue-router'
import { SUPPORTED_LOCALES, setLocale, type Locale } from '@/i18n'

type QueryValue = LocationQueryValue | LocationQueryValue[] | undefined

// The supported locale a query value names, or null.
export function localeHint(value: QueryValue): Locale | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const lower = raw.trim().toLowerCase()

  return (SUPPORTED_LOCALES as readonly string[]).includes(lower) ? (lower as Locale) : null
}

// Applies the hint when it names a supported locale; returns what was applied.
export function applyLocaleHint(value: QueryValue): Locale | null {
  const locale = localeHint(value)
  if (locale) setLocale(locale)

  return locale
}
