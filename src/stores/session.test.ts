import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore } from './session'
import { api, ApiError } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), probe: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn() },
  }
})

const mockProbe = vi.mocked(api.probe)
const mockPost = vi.mocked(api.post)

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('maps /me and marks authenticated on success', async () => {
    mockProbe.mockResolvedValue({
      sub: 'u1',
      name: 'Test User',
      loa: 'high',
      login_method: 'webEid',
      permitted_flows: ['webEid'],
    })

    const session = useSessionStore()
    const ok = await session.fetchMe()

    expect(ok).toBe(true)
    expect(session.isAuthenticated).toBe(true)
    expect(session.identity?.loginMethod).toBe('webEid')
    expect(session.permittedFlows).toEqual(['webEid'])
    // Seal availability absent from /me means UNKNOWN (null) — never a
    // fabricated "no seals" that would hide the e-seal method.
    expect(session.identity?.canEseal).toBeNull()
    expect(session.identity?.seals).toEqual([])
  })

  it('maps seal availability when the login captured it', async () => {
    mockProbe.mockResolvedValue({
      sub: 'u1',
      name: 'Test User',
      loa: 'high',
      login_method: 'eparakstsMobile',
      permitted_flows: ['eparakstsMobile', 'eparakstsMobileEseal'],
      can_eseal: true,
      seals: [
        { id: 'seal-1', label: 'ORG ONE SIA : eZīmogs' },
        { id: 'seal-2', label: 'ORG TWO SIA : eZīmogs' },
      ],
    })

    const session = useSessionStore()
    await session.fetchMe()

    expect(session.identity?.canEseal).toBe(true)
    expect(session.identity?.seals).toHaveLength(2)
    expect(session.identity?.seals[0]).toEqual({ id: 'seal-1', label: 'ORG ONE SIA : eZīmogs' })
  })

  it('maps a verified no-seals answer as false, distinct from unknown', async () => {
    mockProbe.mockResolvedValue({
      sub: 'u1',
      name: 'Test User',
      loa: 'high',
      login_method: 'eparakstsMobile',
      permitted_flows: ['eparakstsMobile'],
      can_eseal: false,
      seals: [],
    })

    const session = useSessionStore()
    await session.fetchMe()

    expect(session.identity?.canEseal).toBe(false)
    expect(session.identity?.seals).toEqual([])
  })

  it('step-up returns the authorization URL to navigate to', async () => {
    mockPost.mockResolvedValue({ authorize_url: 'https://auth.example/authorize?x=1' })

    const session = useSessionStore()
    const url = await session.stepUp('eparakstsMobile')

    expect(url).toBe('https://auth.example/authorize?x=1')
    expect(mockPost).toHaveBeenCalledWith('/step-up', { method: 'eparakstsMobile' })
  })

  it('marks anonymous on a 401 (no session)', async () => {
    mockProbe.mockRejectedValue(new ApiError(401, null, null))

    const session = useSessionStore()
    const ok = await session.fetchMe()

    expect(ok).toBe(false)
    expect(session.status).toBe('anonymous')
    expect(session.identity).toBeNull()
  })

  it('clears identity on logout and returns null when not federated', async () => {
    mockProbe.mockResolvedValue({
      sub: 'u1',
      name: 'Test User',
      loa: 'high',
      login_method: 'webEid',
      permitted_flows: ['webEid'],
    })
    mockPost.mockResolvedValue({ ok: true })

    const session = useSessionStore()
    await session.fetchMe()
    const logoutUrl = await session.logout()

    expect(logoutUrl).toBeNull()
    expect(session.identity).toBeNull()
    expect(session.status).toBe('anonymous')
  })

  it('returns the front-channel logout URL for a federated login', async () => {
    mockPost.mockResolvedValue({
      ok: true,
      logoutUrl: 'https://auth.example/logout?client_id=signbyte-spa&sid=h9&redirect_uri=...',
    })

    const session = useSessionStore()
    const logoutUrl = await session.logout()

    expect(logoutUrl).toContain('/logout?')
    expect(logoutUrl).toContain('client_id=signbyte-spa')
    expect(session.status).toBe('anonymous')
  })
})
