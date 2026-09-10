import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COUNTRY,
  SIGNING_COUNTRIES,
  countryGroups,
  isSigningCountry,
} from './signing-countries'

describe('the countries a co-signer may come from', () => {
  it('offers the published trust plane: 30 EU/EEA territories plus two by agreement', () => {
    expect(SIGNING_COUNTRIES).toHaveLength(32)
    expect(isSigningCountry('MD')).toBe(true)
    expect(isSigningCountry('UA')).toBe(true)
  })

  it('names Greece the way an identity code does, not the way a trust list does', () => {
    // A trust list writes EL; a personal number's country is ISO 3166-1, which is GR.
    // Passing the trust-list code through would file one person under two identities.
    expect(isSigningCountry('GR')).toBe(true)
    expect(isSigningCountry('EL')).toBe(false)
  })

  it('does not offer the United Kingdom under either spelling', () => {
    // Its trust list is a final, frozen one: no new qualified certificate can be issued
    // under it, so an invitation naming it would fail at the certificate.
    expect(isSigningCountry('UK')).toBe(false)
    expect(isSigningCountry('GB')).toBe(false)
  })

  it('offers no country twice', () => {
    expect(new Set(SIGNING_COUNTRIES).size).toBe(SIGNING_COUNTRIES.length)
  })

  it('offers only two-letter upper-case codes', () => {
    for (const code of SIGNING_COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('defaults to a country it actually offers', () => {
    expect(isSigningCountry(DEFAULT_COUNTRY)).toBe(true)
  })

  it('does not offer a country that cannot issue a qualified certificate here', () => {
    for (const code of ['US', 'JP', 'CH', 'RU', 'BY']) {
      expect(isSigningCountry(code)).toBe(false)
    }
  })
})

describe('how the list is offered', () => {
  it('puts the Baltic states first, in their own order', () => {
    const groups = countryGroups('en')
    expect(groups[0].key).toBe('baltic')
    expect(groups[0].countries.map((c) => c.code)).toEqual(['LV', 'EE', 'LT'])
  })

  it('accounts for every country exactly once across the groups', () => {
    const listed = countryGroups('en').flatMap((g) => g.countries.map((c) => c.code))
    expect(listed.sort()).toEqual([...SIGNING_COUNTRIES].sort())
  })

  it('labels a country in the language being read', () => {
    const en = countryGroups('en')[0].countries[0].label
    const lv = countryGroups('lv')[0].countries[0].label
    expect(en).toContain('(LV)')
    expect(lv).toContain('(LV)')
    // Both name Latvia, and not identically — the label is localised, not a code.
    expect(en).not.toBe(lv)
  })

  it('orders the rest alphabetically in the language being read', () => {
    for (const locale of ['en', 'lv']) {
      const rest = countryGroups(locale).find((g) => g.key === 'euEea')
      const labels = rest?.countries.map((c) => c.label) ?? []
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, locale)))
    }
  })
})
