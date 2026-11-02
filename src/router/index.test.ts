import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './index'
import { api } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), probe: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn() },
  }
})

// The screens themselves are not under test: each route renders a stub.
vi.mock('@/views/DashboardView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/DocumentHubView.vue', () => ({ default: { render: () => null } }))

const pendingArchiveKey = 'signbyte.pendingArchive'

describe('the archive timestamp resumed after a fresh sign-in', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.mocked(api.probe).mockResolvedValue({
      sub: 'u1',
      name: 'Test User',
      loa: 'high',
      login_method: 'webEid',
      permitted_flows: ['webEid'],
    })
  })

  it('brings the signed-in person back to the document, to add it again', async () => {
    sessionStorage.setItem(pendingArchiveKey, JSON.stringify({ doc: 'doc-1', at: Date.now() }))
    const router = createAppRouter(createMemoryHistory())

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('document-hub')
    expect(router.currentRoute.value.params.id).toBe('doc-1')
    expect(router.currentRoute.value.query.resumeArchive).toBe('1')
    expect(sessionStorage.getItem(pendingArchiveKey)).toBeNull()
  })

  it('drops a stash left from a sign-in abandoned long ago', async () => {
    sessionStorage.setItem(pendingArchiveKey, JSON.stringify({ doc: 'doc-1', at: Date.now() - 11 * 60 * 1000 }))
    const router = createAppRouter(createMemoryHistory())

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('home')
    expect(sessionStorage.getItem(pendingArchiveKey)).toBeNull()
  })
})
