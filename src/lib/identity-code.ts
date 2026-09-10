// A person's identity code, as it is typed into this portal and as the platform stores
// it. The same signatory's code is written several ways — from a card certificate or an
// identity provider it carries the identity type and the country ("PNOLV-050990-66731"),
// while a person types only their national code, with or without its separator. Compared
// character by character those are different people.
//
// The services collapse them to one stored spelling and compare that. This module is the
// screen's copy of the same rule, and it is here for one measured reason: the portal's
// public boundary withholds error detail, so a code the platform refuses comes back as
// `422 err:request:unprocessable` naming no field at all. Nothing the server says can
// tell a person which character to change — so the request has to be prevented, with an
// explanation, before it is sent.
//
// Whatever this sends is canonicalised again by the receiving service, which is what
// makes it safe for the rule to live twice: this copy is input and display polish and
// cannot decide an identity. It follows `go-authbyte/identitycode` deliberately —
// same tests in the same order, same refusals — plus one layer the library does not have:
// a per-country length check, which exists only where a person types.

// The identity types recognised on the wire. The natural-person ones may be invited to
// sign; a legal-person one may not (see `PERSON_TYPES`).
const KNOWN_TYPES = new Set(['PNO', 'NTR', 'PAS', 'IDC', 'TIN'])

// A signing slot is matched against the identity of whoever logs in, and nobody logs in
// as an organisation — an organisation's e-seal is a signing METHOD its people choose,
// not an identity anyone authenticates as. So only a natural person can be invited:
// `NTR` is a national trade-register number, carried in a certificate's
// organizationIdentifier rather than its serialNumber.
const PERSON_TYPES = new Set(['PNO', 'PAS', 'IDC', 'TIN'])

// The type given to a code that arrives with none of its own: a code typed into a
// personal-code field is a personal number.
const PERSONAL_NUMBER = 'PNO'

// A code that names its own type and country: three letters, two letters, then the
// hyphen the standard puts there. The hyphen is required — without it there is no
// telling a prefix from an identifier that happens to start with letters.
const PREFIXED = /^([A-Za-z]{3})([A-Za-z]{2})-([\s\S]*)$/
// A nationally defined type (two letters and a colon). None is recognised, so the shape
// exists here only to be refused as a prefix rather than mistaken for an identifier.
const LOCAL_PREFIXED = /^[A-Za-z]{2}:[A-Za-z]{2}-/
// The shape a code takes when it crosses a border in a login: the country of the code,
// the country that asked for it, then the code.
const CROSS_BORDER = /^([A-Za-z]{2})\/([A-Za-z]{2})\/([\s\S]+)$/

// Why a code cannot be used. Each one is a case where sending anything at all would mean
// sending a guess — and the portal is the only place that can say which.
export type IdentityCodeProblem =
  | 'empty'
  | 'malformed'
  | 'unknownType'
  | 'notAPerson'
  | 'ambiguous'
  | 'countryMissing'
  | 'length'
  | 'digits'

export interface IdentityCode {
  // The identity type, e.g. "PNO" for a national personal number.
  type: string
  // The two-letter country whose register issued the identifier. Part of the identity:
  // the same digits in two countries belong to two people.
  country: string
  // The identifier itself, separators removed and upper-cased.
  identifier: string
  // True when the country came from the value rather than from the chosen one. The
  // screen follows it: a pasted qualified code moves the dropdown.
  countryFromValue: boolean
}

export interface IdentityCodeOk {
  ok: true
  code: IdentityCode
  // The one spelling the platform stores and compares.
  stored: string
  // What a person is shown: their national code written the way their country writes it
  // where that is known, and the whole stored code everywhere else.
  display: string
}

export interface IdentityCodeError {
  ok: false
  problem: IdentityCodeProblem
  // The offending identity type, for the two problems that name one.
  type?: string
  // For 'length': how many digits the country's format has, and how many were given.
  expected?: number
  actual?: number
}

export type IdentityCodeResult = IdentityCodeOk | IdentityCodeError

// The separators different systems put between a code's groups, none of which is part of
// the code.
function isSeparator(ch: string): boolean {
  return /\s/.test(ch) || ch === '-' || ch === '.' || ch === '/'
}

// Reduce the part after the identity type to the form that is stored. Only ASCII letters
// and digits survive: an identity code is written in them, and a letter from another
// alphabet that merely looks like one must not be able to pass as it.
function toIdentifier(part: string): string | null {
  let out = ''
  for (const ch of part) {
    if (isSeparator(ch)) continue
    if (ch >= '0' && ch <= '9') {
      out += ch
      continue
    }
    if (ch >= 'A' && ch <= 'Z') {
      out += ch
      continue
    }
    if (ch >= 'a' && ch <= 'z') {
      out += ch.toUpperCase()
      continue
    }

    return null
  }

  return out || null
}

// An identifier that opens with the five letters an identity type and a country are
// written in cannot be told from a code that names its own type.
function beginsLikeAPrefix(identifier: string): boolean {
  return identifier.length >= 5 && /^[A-Za-z]{5}/.test(identifier)
}

// How a country writes its own personal number, where that is known. Cosmetic: nothing
// compares a displayed value. Latvia writes six digits, a hyphen and five; the leading
// group was once a date of birth and since 2017 need not be, so the split is on length
// alone and never on what the digits mean.
const NATIONAL_SPLITS: Record<string, (identifier: string) => string | null> = {
  LV: (id) => (id.length === 11 && /^[0-9]+$/.test(id) ? `${id.slice(0, 6)}-${id.slice(6)}` : null),
}

// The shape a country's personal number takes, where the format is known. Length and
// characters only, never a checksum: a typed code is a REFERENCE, and the strict
// resolution happens later against the certificate of whoever actually signs in — so a
// checksum rule written for one country would only add a way to refuse a real foreign
// signer. A country absent here is checked leniently, which is deliberate.
const NATIONAL_SHAPES: Record<string, { digits: number }> = {
  LV: { digits: 11 },
  EE: { digits: 11 },
  LT: { digits: 11 },
}

// The country named so a sentence can be built around it — an adjective in English, a
// genitive in Latvian. Only a country with a known shape needs one, and a country
// without a word here falls back to a form that needs no inflection, so this table and
// NATIONAL_SHAPES cannot drift into a missing translation.
export const COUNTRY_WORD: Record<string, Record<string, string>> = {
  en: { LV: 'A Latvian', EE: 'An Estonian', LT: 'A Lithuanian' },
  lv: { LV: 'Latvijas', EE: 'Igaunijas', LT: 'Lietuvas' },
}

function fail(problem: IdentityCodeProblem, extra: Partial<IdentityCodeError> = {}): IdentityCodeError {
  return { ok: false, problem, ...extra }
}

function assemble(code: IdentityCode): IdentityCodeOk {
  const stored = `${code.type}${code.country}-${code.identifier}`

  return { ok: true, code, stored, display: displayOf(code) }
}

// What to show a person. The country and the type are never dropped except where the
// country's own spelling identifies the code on its own — "050990-66731" reads as a
// personal number to a Latvian and to nobody else. Everywhere else the stored code is
// shown, because a bare identifier would render a person, a foreign namesake holding the
// same digits and an organisation's register number as one identical string. This is the
// platform's ruled display rule, mirrored rather than reinvented: what a person is shown
// can be typed back in and reaches that same person.
function displayOf(code: IdentityCode): string {
  if (code.type === PERSONAL_NUMBER) {
    const split = NATIONAL_SPLITS[code.country]
    if (split) {
      const spelled = split(code.identifier)
      if (spelled) return spelled
    }
  }

  return `${code.type}${code.country}-${code.identifier}`
}

// Turn what somebody typed into the one spelling the platform stores, using the country
// chosen beside it.
//
// `country` is consulted only when the value names none of its own: a country carried in
// the value always wins, and one that contradicts the chosen one is not an error — a
// partner's system and a person's typing are both allowed to be right.
export function parseIdentityCode(raw: string, country: string): IdentityCodeResult {
  let value = (raw ?? '').trim()
  if (!value) return fail('empty')

  let hint = (country ?? '').trim()

  // A cross-border code can arrive wrapped more than once. Each pass strips one country
  // pair, so the value shortens every time and the loop ends. The leading country is the
  // one that belongs to the code; the second says only who asked for it.
  for (;;) {
    const wrapped = CROSS_BORDER.exec(value)
    if (!wrapped) break
    hint = wrapped[1]
    value = wrapped[3].trim()
  }

  const prefixed = PREFIXED.exec(value)
  if (prefixed) {
    const type = prefixed[1].toUpperCase()
    if (!KNOWN_TYPES.has(type)) return fail('unknownType', { type })
    if (!PERSON_TYPES.has(type)) return fail('notAPerson', { type })
    const identifier = toIdentifier(prefixed[3])
    if (!identifier) return fail('malformed')

    return withShape({
      type,
      country: prefixed[2].toUpperCase(),
      identifier,
      countryFromValue: true,
    })
  }

  if (LOCAL_PREFIXED.test(value)) return fail('unknownType', { type: value.slice(0, 2).toUpperCase() })

  if (!hint) return fail('countryMissing')
  if (!/^[A-Za-z]{2}$/.test(hint)) return fail('countryMissing')

  const identifier = toIdentifier(value)
  if (!identifier) return fail('malformed')
  if (beginsLikeAPrefix(identifier)) return fail('ambiguous')

  return withShape({
    type: PERSONAL_NUMBER,
    country: hint.toUpperCase(),
    identifier,
    countryFromValue: false,
  })
}

// The screen's own layer, applied after the code is understood: does this look like a
// personal number of the country it claims? Only where that format is known.
function withShape(code: IdentityCode): IdentityCodeResult {
  const shape = code.type === PERSONAL_NUMBER ? NATIONAL_SHAPES[code.country] : undefined
  if (!shape) return assemble(code)
  if (!/^[0-9]+$/.test(code.identifier)) return fail('digits')
  if (code.identifier.length !== shape.digits) {
    return fail('length', { expected: shape.digits, actual: code.identifier.length })
  }

  return assemble(code)
}

// What the field shows once the person leaves it: the national code, grouped the way its
// country writes it. The country lives in the control beside it, so it is not repeated
// here — except for a code whose type is not a personal number, which is shown whole
// because its type is part of what it is.
export function collapsedInput(code: IdentityCode): string {
  if (code.type === PERSONAL_NUMBER) {
    const split = NATIONAL_SPLITS[code.country]
    if (split) {
      const spelled = split(code.identifier)
      if (spelled) return spelled
    }

    return code.identifier
  }

  return `${code.type}${code.country}-${code.identifier}`
}

// The example to show in an empty field, for a country whose format is known.
export function placeholderFor(country: string): string {
  if (!NATIONAL_SHAPES[country]) return ''

  return country === 'LV' ? '050990-66731' : '39001011234'
}

// Show a stored code — the form the platform holds, which is what a composed envelope
// answers. A value this cannot take apart is shown unchanged: a display is cosmetic, and
// seeing the raw value serves a person better than seeing nothing.
export function displayIdentityCode(stored: string): string {
  const value = (stored ?? '').trim()
  const match = /^([A-Z]{3})([A-Z]{2})-([A-Z0-9]+)$/.exec(value)
  if (!match || !KNOWN_TYPES.has(match[1])) return stored

  return displayOf({
    type: match[1],
    country: match[2],
    identifier: match[3],
    countryFromValue: true,
  })
}
