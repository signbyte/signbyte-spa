import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDashboardStore, type ChainRow } from './dashboard'
import { api, ApiError } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)

function chain(id: string, over: Partial<ChainRow> = {}): ChainRow {
  return {
    chainRootId: id,
    id,
    kind: 'source',
    status: 'received',
    filename: `${id}.pdf`,
    mime: 'application/pdf',
    size: 1024,
    hasSignatures: false,
    platformSigned: false,
    retentionUntil: new Date(Date.now() + 3_600_000).toISOString(),
    chainCreatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  }
}

describe('dashboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads the composed view in one call and marks ready', async () => {
    mockGet.mockResolvedValue({
      tasks: [],
      envelopes: [{ id: 'env-1', status: 'in_progress', version: 1 }],
      chains: [chain('doc-2')],
    })

    const store = useDashboardStore()
    await store.load()

    expect(mockGet).toHaveBeenCalledWith('/dashboard')
    expect(store.state).toBe('ready')
    expect(store.envelopes).toHaveLength(1)
    expect(store.chains).toHaveLength(1)
  })

  it('marks empty when all three lists are empty', async () => {
    mockGet.mockResolvedValue({ tasks: [], envelopes: [], chains: [] })

    const store = useDashboardStore()
    await store.load()

    expect(store.state).toBe('empty')
    expect(store.isEmpty).toBe(true)
  })

  it('finds a chain row by its head id for the hub view', async () => {
    mockGet.mockResolvedValue({
      tasks: [],
      envelopes: [],
      chains: [chain('doc-1', { id: 'cont-1', kind: 'container', platformSigned: true, hasSignatures: true })],
    })

    const store = useDashboardStore()
    await store.load()

    expect(store.chainByHead('cont-1')?.chainRootId).toBe('doc-1')
    expect(store.chainByHead('nope')).toBeNull()
  })

  it('resolves a chain by its head OR its chain-root id', async () => {
    mockGet.mockResolvedValue({
      tasks: [],
      envelopes: [],
      chains: [chain('doc-1', { id: 'cont-1', kind: 'container', platformSigned: true, hasSignatures: true })],
    })

    const store = useDashboardStore()
    await store.load()

    // The hub is reached by the head id (dashboard row) OR the source/root id
    // (a redirect off the sign route) — both resolve to the same chain.
    expect(store.chainForId('cont-1')?.id).toBe('cont-1')
    expect(store.chainForId('doc-1')?.id).toBe('cont-1')
    expect(store.chainForId('nope')).toBeNull()
  })

  it('carries preservationClass through so the trail can show a durable "archived"', async () => {
    mockGet.mockResolvedValue({
      tasks: [],
      envelopes: [],
      chains: [
        chain('doc-1', { id: 'cont-1', kind: 'container', platformSigned: true, preservationClass: 'preservation' }),
      ],
    })

    const store = useDashboardStore()
    await store.load()

    // 'preservation' = archive-timestamped (B-LTA); the hub derives its durable
    // "archived" trail row from exactly this, so it must survive the projection.
    expect(store.chainForId('doc-1')?.preservationClass).toBe('preservation')
  })

  it('carries resultFrozen through so the row renders "in signing" and the hub hides the dead download', async () => {
    mockGet.mockResolvedValue({
      tasks: [],
      envelopes: [],
      chains: [chain('doc-1', { resultFrozen: true })],
    })

    const store = useDashboardStore()
    await store.load()

    // A frozen chain is a signing-in-progress workflow: not a draft the viewer
    // could delete, not a completed result they could take away.
    expect(store.chainForId('doc-1')?.resultFrozen).toBe(true)
  })

  it('maps a failed load to a stable error key and clears the lists', async () => {
    mockGet.mockRejectedValue(new ApiError(502, null, null))

    const store = useDashboardStore()
    await store.load()

    expect(store.state).toBe('error')
    expect(store.errorKey).toBe('errors.upstream')
    expect(store.chains).toHaveLength(0)
  })
})
