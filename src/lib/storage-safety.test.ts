import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { api } from '@/lib/api'
import { useSessionStore } from '@/stores/session'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)

function entries(store: Storage): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k) out.push([k, store.getItem(k) ?? ''])
  }
  return out
}

// The headline control (cookie-session BFF): nothing exfiltratable lives in the
// browser. A successful session must leave no token, key, or refresh value in
// localStorage or sessionStorage — only non-secret UI preferences.
describe('browser storage holds no credentials', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('writes no token/key after establishing a session', async () => {
    mockGet.mockResolvedValue({
      sub: 'u1',
      name: 'Test User',
      loa: 'high',
      login_method: 'webEid',
      permitted_flows: ['webEid'],
    })

    const session = useSessionStore()
    await session.fetchMe()

    const all = [...entries(localStorage), ...entries(sessionStorage)]
    for (const [key, value] of all) {
      expect(key.toLowerCase()).not.toMatch(/token|secret|dpop|refresh|private|jwk/)
      // No JWT-shaped value, either.
      expect(value).not.toMatch(/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./)
    }
  })
})
