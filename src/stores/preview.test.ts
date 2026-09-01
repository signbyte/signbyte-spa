import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePreviewStore, type PreviewManifest } from './preview'
import { api, ApiError } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn(), download: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)

// Lets the fire-and-forget text-layer fetch settle after load() resolves.
const flush = () => Promise.resolve().then(() => Promise.resolve())

function manifest(over: Partial<PreviewManifest> = {}): PreviewManifest {
  return {
    documentId: 'doc-1',
    format: 'pdf',
    pageCount: 2,
    pages: [
      { index: 0, width: 800, height: 1000, imageRef: 'a' },
      { index: 1, width: 800, height: 1000, imageRef: 'b' },
    ],
    renderable: true,
    ...over,
  }
}

describe('preview store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads a renderable manifest and marks ready', async () => {
    mockGet
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce({ documentId: 'doc-1', pages: ['', ''] })

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')

    expect(store.state).toBe('ready')
    expect(store.manifest?.pageCount).toBe(2)
    expect(store.errorKey).toBeNull()
    expect(mockGet).toHaveBeenCalledWith('/documents/doc-1/preview')
  })

  it('fetches the text layer for screen readers when the document is renderable', async () => {
    mockGet
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce({ documentId: 'doc-1', pages: ['page one', 'page two'] })

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')
    await flush()

    expect(mockGet).toHaveBeenCalledWith('/documents/doc-1/preview/text')
    expect(store.text[0]).toBe('page one')
  })

  it('treats a non-renderable type as unsupported, not an error', async () => {
    mockGet.mockResolvedValueOnce({
      documentId: 'doc-1',
      renderable: false,
      reason: 'unsupported_format',
      mime: 'text/plain',
    })

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')

    expect(store.state).toBe('unsupported')
    expect(store.reason).toBe('unsupported_format')
    // A not-renderable result must not trigger the text-layer fetch.
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('maps a transport failure to a safe error key without exposing the body', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(502, 'upstream_error', { secret: 'nope' }))

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')

    expect(store.state).toBe('error')
    expect(store.errorKey).toBe('errors.upstream')
    expect(store.manifest).toBeNull()
  })

  it('routes an expired session to the session error key', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(401, null, null))

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')

    expect(store.errorKey).toBe('errors.session')
  })

  it('stays ready when the text layer is unavailable', async () => {
    mockGet.mockResolvedValueOnce(manifest()).mockRejectedValueOnce(new ApiError(404, null, null))

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')
    await flush()

    expect(store.state).toBe('ready')
    expect(store.text).toEqual([])
  })

  it('resets to a clean state', async () => {
    mockGet
      .mockResolvedValueOnce(manifest())
      .mockResolvedValueOnce({ documentId: 'doc-1', pages: [] })

    const store = usePreviewStore()
    await store.load('/documents/doc-1/preview')
    store.reset()

    expect(store.state).toBe('idle')
    expect(store.manifest).toBeNull()
    expect(store.text).toEqual([])
    expect(store.reason).toBeNull()
  })
})
