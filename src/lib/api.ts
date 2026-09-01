// The one HTTP path out of the SPA: a thin wrapper over native fetch that talks
// only to the portal API. It sends the session cookie automatically (credentials:
// include), echoes the readable anti-forgery token on every state-changing call,
// surfaces a typed error the UI maps to safe messages, and routes an expired
// session back to login. No token, key, or refresh value is ever held here.

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/portal/v1'

// The app-readable anti-forgery cookie the API sets; echoed back in this header.
const CSRF_COOKIE = 'portal_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** A short, stable error code from the API body when present (e.g. binding_mismatch). */
    readonly code: string | null,
    /** The parsed body, for callers that need detail. Never rendered raw. */
    readonly body: unknown,
    /**
     * The RFC 9457 `trace_id` when present — safe to show as a support reference so
     * an operator can find every correlated log line for this failure. Never a secret.
     */
    readonly traceId: string | null = null,
  ) {
    super(`api ${status}${code ? ` (${code})` : ''}`)
    this.name = 'ApiError'
  }
}

// Registered by the app shell so a 401 anywhere routes to login once.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}

interface RequestOptions {
  method?: string
  /** A JSON-serialisable body; mutually exclusive with `form`. */
  json?: unknown
  /** A multipart body (e.g. an upload); sent as-is, no content-type override. */
  form?: FormData
  signal?: AbortSignal
  /**
   * An expected-auth-state check (the session probe): a 401 is an answer
   * ("no session"), not an authorization failure — it must not trigger the
   * global unauthorized navigation. Without this, a signed-out visitor landing
   * on any public screen gets yanked to login by their own session check.
   */
  probe?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined

  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (opts.form) {
    body = opts.form
  }

  if (MUTATING.has(method)) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers[CSRF_HEADER] = csrf
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body,
    signal: opts.signal,
  })

  if (res.status === 401 && !opts.probe) {
    onUnauthorized?.()
  }

  const payload = await parseBody(res)

  if (!res.ok) {
    throw toApiError(res.status, payload)
  }

  return payload as T
}

// Extracts the stable error code from the portal API's error envelope. The API
// returns RFC 9457 problem+json, so the code lives in `code` (an err:domain:reason
// string, e.g. "err:document:chainAdvanced"); the legacy `error` field is still
// accepted as a fallback for any non-migrated producer. Without a matching code the
// UI's guidance map degrades to the generic message.
export function toApiError(status: number, payload: unknown): ApiError {
  let code: string | null = null
  let traceId: string | null = null
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    if (typeof p.code === 'string') code = p.code
    else if (typeof p.error === 'string') code = p.error
    // RFC 9457 problem+json carries the operator's key as `trace_id`.
    if (typeof p.trace_id === 'string') traceId = p.trace_id
    else if (typeof p.traceId === 'string') traceId = p.traceId
  }

  return new ApiError(status, code, payload, traceId)
}

// Reads the download filename the server suggests, preferring the RFC 5987
// (UTF-8) form and falling back to the plain quoted name. Returns null when the
// header is absent or unparseable so the caller can apply a default.
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null

  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      /* fall through to the plain form */
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)

  return plain?.[1] ?? null
}

// Streams a file to disk using the server's suggested filename. It goes through
// the same credentialed path as every other call (a 401 still routes to login),
// and the bytes go straight to a download — they are never kept as app state.
async function download(path: string, fallbackName = 'document'): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'GET', credentials: 'include' })

  if (res.status === 401) {
    onUnauthorized?.()
  }
  if (!res.ok) {
    throw toApiError(res.status, await parseBody(res))
  }

  const blob = await res.blob()
  const name = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Builds a URL for a portal API path — for the few places that need the URL itself
// rather than a fetched body, e.g. an <img> src for a rendered preview page. The
// browser fetches it over the same credentialed, same-origin channel, so the
// session cookie rides along automatically; no token is ever placed in the URL.
export function apiUrl(path: string): string {
  return `${BASE}${path}`
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const type = res.headers.get('content-type') ?? ''
  // Matches every JSON media type — plain `application/json` AND the API's
  // error envelope `application/problem+json` (an exact-substring check on
  // "application/json" silently misses the latter, turning every typed error
  // into an opaque blob and degrading the UI to its generic message).
  if (/[/+]json\b/.test(type)) return res.json()
  if (type.startsWith('text/')) return res.text()
  return res.blob()
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  /** GET whose 401 means "no session" — never triggers the login navigation. */
  probe: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal, probe: true }),
  post: <T>(path: string, json?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', json, signal }),
  postForm: <T>(path: string, form: FormData, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', form, signal }),
  del: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'DELETE', signal }),
  download,
}
