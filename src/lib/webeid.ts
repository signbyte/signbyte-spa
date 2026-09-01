// Loads the vendored Web eID browser library (public/web-eid.js, same-origin, never
// a CDN) and runs the card authentication. This is the only cryptography that runs
// in the browser, and it is the card's own — performed by the Web eID extension +
// native app. Requires a secure context, the extension, and a card reader.

interface WebEidModule {
  authenticate(challengeNonce: string, options?: { lang?: string }): Promise<unknown>
  getSigningCertificate(options?: { lang?: string }): Promise<{ certificate: string }>
  sign(
    certificate: string,
    hash: string,
    hashFunction: string,
    options?: { lang?: string },
  ): Promise<{ signature: string }>
}

// A non-literal path so the bundler/type-checker leaves it as a runtime fetch.
const LIB_PATH = '/web-eid.js'

let cached: WebEidModule | null = null

declare global {
  interface Window {
    webeid?: WebEidModule
  }
}

export async function loadWebEid(): Promise<WebEidModule> {
  if (cached) return cached

  // Self-contained global build, if present.
  if (typeof window.webeid?.authenticate === 'function') {
    cached = window.webeid

    return cached
  }

  const mod = (await import(/* @vite-ignore */ LIB_PATH)) as Record<string, unknown>
  const candidate = (
    typeof mod.authenticate === 'function' ? mod : (mod.default as Record<string, unknown> | undefined)
  ) as WebEidModule | undefined

  if (!candidate || typeof candidate.authenticate !== 'function') {
    throw new WebEidError(null, 'web-eid library unavailable')
  }
  cached = candidate

  return candidate
}

export class WebEidError extends Error {
  constructor(
    readonly code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'WebEidError'
  }
}

// Where to send the user to install the Web eID software when it's missing. Windows
// x64 build for the MVP; a per-platform picker can replace this later.
export const WEB_EID_INSTALL_URL =
  'https://installer.id.ee/media/web-eid/web-eid_2.9.0.927.x64.exe'

// True when the failure is "the browser extension / native app is missing", so the
// UI can show the install guidance rather than a generic error.
export function isExtensionMissing(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code
  return typeof code === 'string' && /EXTENSION|NATIVE|UNAVAILABLE/i.test(code)
}

// Sign the challenge nonce with the card; returns the opaque auth token the API
// forwards verbatim to the Auth Service.
export async function authenticateWithCard(nonce: string, lang: string): Promise<unknown> {
  const webeid = await loadWebEid()

  return webeid.authenticate(nonce, { lang })
}

// Read the card's SIGNING certificate (PIN 1). The signing service uses it to
// compute the per-document digest the card will then sign. A certificate is public
// data, not a secret.
export async function readSigningCertificate(lang: string): Promise<string> {
  const webeid = await loadWebEid()
  const { certificate } = await webeid.getSigningCertificate({ lang })

  return certificate
}

// Read the card's AUTHENTICATION certificate (PIN 1). It is needed when the
// signature is finalized (timestamp access), separate from the signing certificate.
// Web eID returns it as the authenticate token's `unverifiedCertificate`; the nonce
// is a throwaway — only the certificate is taken, the token is not used.
export async function readAuthCertificate(lang: string): Promise<string> {
  const webeid = await loadWebEid()
  const token = (await webeid.authenticate(throwawayNonce(), { lang })) as {
    unverifiedCertificate?: string
  }

  return token?.unverifiedCertificate ?? ''
}

// Sign one digest with the card (PIN 2 — the legally-binding signing act). The hash
// function must match the digest's algorithm; see hashFnForDigest. Returns the raw
// signature value the signing service submits.
export async function signDigest(
  certificate: string,
  digest: string,
  hashFn: string,
  lang: string,
): Promise<string> {
  const webeid = await loadWebEid()
  const { signature } = await webeid.sign(certificate, digest, hashFn, { lang })

  return signature
}

// Pick the Web eID hash function from the digest's decoded byte length (32 -> SHA-256,
// 48 -> SHA-384, 64 -> SHA-512), falling back to the reported algorithm when the
// length is unrecognized. The card must be told the function that matches the digest
// length: Latvian eID signing keys are ECDSA P-384, so the bytes-to-sign are a
// 48-byte SHA-384 hash even when the report labels the document-reference digest
// "SHA-256". Deriving from length is robust.
export function hashFnForDigest(digest: string, reported?: string): string {
  let len = 0
  try {
    len = atob(digest.replace(/-/g, '+').replace(/_/g, '/')).length
  } catch {
    /* fall through to the reported label */
  }
  if (len === 32) return 'SHA-256'
  if (len === 48) return 'SHA-384'
  if (len === 64) return 'SHA-512'

  return (reported ?? 'SHA-256').toUpperCase().replace(/^SHA-?(\d+)$/, 'SHA-$1')
}

// A throwaway challenge nonce for the auth-certificate read. It is long enough for
// the Web eID library's minimum and is never validated by any service.
function throwawayNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
