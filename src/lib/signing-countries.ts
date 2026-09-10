// The countries a co-signer's identity code may come from, and the order they are
// offered in.
//
// A person invited here has to be able to sign here, and that means holding a qualified
// certificate the platform can validate. The set of countries able to issue one is not
// ours to invent: it is published, as the scheme territories of the EU List of Trusted
// Lists and of the mutual-recognition list beside it.
//
//   https://ec.europa.eu/tools/lotl/eu-lotl.xml        the EU and EEA trust lists
//   https://ec.europa.eu/tools/lotl/mra/ades-lotl.xml  third countries recognised by agreement
//
// Observed 2026-09-10: the first points at 31 territories, the second at Moldova and
// Ukraine. The list below is those, less the United Kingdom, whose pointer is a final
// frozen list published so signatures made before its withdrawal stay validatable — it
// cannot issue a new qualified certificate, so inviting somebody under it would fail at
// the certificate rather than at this field. A holder of a still-valid older UK
// certificate can still be invited by typing the qualified code, because a country
// stated in the code always wins over the one chosen here.
//
// TRANSLATED, NOT COPIED. A trust list writes Greece "EL" and the United Kingdom "UK";
// an identity code's country is an ISO 3166-1 alpha-2 code, which writes them "GR" and
// "GB". Every other territory is spelled the same in both, which is exactly what makes
// those two dangerous: passing a trust list's own code through would file a Greek person
// under "PNOEL-…" while their certificate says "PNOGR-…" — one person, two identities.
// The mapping happens here, once, so nothing downstream ever sees a trust-list code.

// Latvia, Estonia and Lithuania first: this platform's people, and the default.
const BALTIC = ['LV', 'EE', 'LT'] as const

// The rest of the EU and EEA, as ISO codes (Greece as GR).
const EU_EEA = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE',
  'IS', 'IT', 'LI', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
] as const

// Recognised by mutual-recognition agreement rather than by membership.
const MUTUAL_RECOGNITION = ['MD', 'UA'] as const

// The country a code is assumed to come from until somebody chooses otherwise.
export const DEFAULT_COUNTRY = 'LV'

export interface CountryOption {
  code: string
  label: string
}

export interface CountryGroup {
  // Which group this is; the caller supplies the words.
  key: 'baltic' | 'euEea' | 'mutual'
  countries: CountryOption[]
}

// Every country offered, flat — for validating a chosen value.
export const SIGNING_COUNTRIES: readonly string[] = [...BALTIC, ...EU_EEA, ...MUTUAL_RECOGNITION]

export function isSigningCountry(code: string): boolean {
  return SIGNING_COUNTRIES.includes(code)
}

// A country's name in the reader's own language, from the browser rather than from a
// translation table of our own: there is no version of this list that can fall behind
// the locale files, and no country name to review. Where the browser cannot name one,
// the code stands in for it — a name is a label here, never an identity.
function namer(locale: string): (code: string) => string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' })

    return (code) => {
      try {
        return names.of(code) || code
      } catch {
        return code
      }
    }
  } catch {
    return (code) => code
  }
}

// The dropdown's contents: the Baltic states in their own order, then everything else
// alphabetically **in the language being read**, which is not the same order in Latvian
// as in English.
export function countryGroups(locale: string): CountryGroup[] {
  const name = namer(locale)
  const option = (code: string): CountryOption => ({ code, label: `${name(code)} (${code})` })
  const byName = (a: CountryOption, b: CountryOption) => a.label.localeCompare(b.label, locale)

  return [
    { key: 'baltic', countries: BALTIC.map(option) },
    { key: 'euEea', countries: EU_EEA.map(option).sort(byName) },
    { key: 'mutual', countries: MUTUAL_RECOGNITION.map(option).sort(byName) },
  ]
}
