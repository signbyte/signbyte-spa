import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDocumentsStore, type DocumentSummary } from './documents'
import { api, ApiError } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn(), download: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)
const mockPostForm = vi.mocked(api.postForm)
const mockDel = vi.mocked(api.del)
const mockDownload = vi.mocked(api.download)

function doc(id: string, over: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    filename: `${id}.pdf`,
    mime: 'application/pdf',
    size: 1024,
    status: 'received',
    preservationClass: 'none',
    retentionUntil: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...over,
  }
}

describe('documents store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads documents and marks ready when there are rows', async () => {
    mockGet.mockResolvedValue({ documents: [doc('doc-1'), doc('doc-2')], count: 2 })

    const store = useDocumentsStore()
    await store.load()

    expect(store.state).toBe('ready')
    expect(store.items).toHaveLength(2)
    expect(store.errorKey).toBeNull()
  })

  it('marks empty when the user has no documents', async () => {
    mockGet.mockResolvedValue({ documents: [], count: 0 })

    const store = useDocumentsStore()
    await store.load()

    expect(store.state).toBe('empty')
    expect(store.items).toHaveLength(0)
  })

  it('maps a failure to a safe error key without exposing the body', async () => {
    mockGet.mockRejectedValue(new ApiError(502, 'upstream_error', { secret: 'nope' }))

    const store = useDocumentsStore()
    await store.load()

    expect(store.state).toBe('error')
    expect(store.errorKey).toBe('errors.upstream')
    expect(store.items).toHaveLength(0)
  })

  it('uploads then reloads the list so the new row appears', async () => {
    mockPostForm.mockResolvedValue({ id: 'doc-9' })
    mockGet.mockResolvedValue({ documents: [doc('doc-9')], count: 1 })

    const store = useDocumentsStore()
    await store.upload(new File(['bytes'], 'lease.pdf', { type: 'application/pdf' }))

    expect(mockPostForm).toHaveBeenCalledWith('/documents', expect.any(FormData))
    expect(mockGet).toHaveBeenCalledWith('/documents')
    expect(store.items).toHaveLength(1)
  })

  it('sends the browser mime explicitly, since the BFF re-encoding would otherwise drop it', async () => {
    mockPostForm.mockResolvedValue({ id: 'doc-9' })
    mockGet.mockResolvedValue({ documents: [], count: 0 })

    const store = useDocumentsStore()
    await store.upload(new File(['%PDF-1.7'], 'lease.pdf', { type: 'application/pdf' }))

    const form = mockPostForm.mock.calls[0][1] as FormData
    expect(form.get('mime')).toBe('application/pdf')
  })

  it('reports whether the uploaded file already carried a signature', async () => {
    mockPostForm.mockResolvedValue({ id: 'doc-9', hasSignatures: true })
    mockGet.mockResolvedValue({ documents: [doc('doc-9')], count: 1 })

    const store = useDocumentsStore()
    const result = await store.upload(new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' }))

    expect(result).toEqual({ id: 'doc-9', hasSignatures: true })
  })

  it('defaults hasSignatures to false when the server omits it', async () => {
    mockPostForm.mockResolvedValue({ id: 'doc-9' })
    mockGet.mockResolvedValue({ documents: [doc('doc-9')], count: 1 })

    const store = useDocumentsStore()
    const result = await store.upload(new File(['bytes'], 'lease.pdf', { type: 'application/pdf' }))

    expect(result.hasSignatures).toBe(false)
  })

  it('removes a document and drops it from the list', async () => {
    mockGet.mockResolvedValue({ documents: [doc('doc-1'), doc('doc-2')], count: 2 })
    mockDel.mockResolvedValue(null)

    const store = useDocumentsStore()
    await store.load()
    await store.remove('doc-1')

    expect(mockDel).toHaveBeenCalledWith('/documents/doc-1')
    expect(store.items.map((d) => d.id)).toEqual(['doc-2'])
  })

  it('falls back to the empty state after the last document is removed', async () => {
    mockGet.mockResolvedValue({ documents: [doc('doc-1')], count: 1 })
    mockDel.mockResolvedValue(null)

    const store = useDocumentsStore()
    await store.load()
    await store.remove('doc-1')

    expect(store.items).toHaveLength(0)
    expect(store.state).toBe('empty')
  })

  it('downloads through the credentialed file path', async () => {
    mockDownload.mockResolvedValue(undefined)

    const store = useDocumentsStore()
    await store.download('doc-1')

    expect(mockDownload).toHaveBeenCalledWith('/documents/doc-1/download')
  })

  it('fetches one document by id, e.g. for a co-signer signing someone else’s document', async () => {
    mockGet.mockResolvedValue({ id: 'doc-1', filename: 'lease.pdf', mime: 'application/pdf' })

    const store = useDocumentsStore()
    const meta = await store.get('doc-1')

    expect(mockGet).toHaveBeenCalledWith('/documents/doc-1')
    expect(meta).toEqual({ id: 'doc-1', filename: 'lease.pdf', mime: 'application/pdf' })
  })

  it('bundles staged sources into one unsigned container (in order) and returns its inner files', async () => {
    vi.mocked(api.post).mockResolvedValue({
      id: 'cont-1',
      filename: 'a.asice',
      mime: 'application/vnd.etsi.asic-e+zip',
      size: 999,
      innerFiles: [
        { name: 'a.pdf', mediaType: 'application/pdf', size: 10 },
        { name: 'b.docx' },
      ],
    })

    const store = useDocumentsStore()
    const b = await store.bundle(['s1', 's2'])

    expect(api.post).toHaveBeenCalledWith('/documents/bundle', { sourceIds: ['s1', 's2'] })
    expect(b.id).toBe('cont-1')
    expect(b.innerFiles.map((f) => f.name)).toEqual(['a.pdf', 'b.docx'])
  })

  it('rebundles from entries in final order (existing inner by name, new source by id)', async () => {
    vi.mocked(api.post).mockResolvedValue({
      id: 'cont-1',
      filename: 'a.asice',
      mime: 'application/vnd.etsi.asic-e+zip',
      size: 1,
      innerFiles: [{ name: 'b.docx' }, { name: 'c.pdf' }],
    })

    const store = useDocumentsStore()
    await store.rebundle('cont-1', [{ name: 'b.docx' }, { sourceId: 's3' }])

    expect(api.post).toHaveBeenCalledWith('/documents/cont-1/rebundle', {
      entries: [{ name: 'b.docx' }, { sourceId: 's3' }],
    })
  })

  it('normalizes a bundle response with no innerFiles to an empty array', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'cont-1', filename: 'a.asice', mime: 'x', size: 1 })

    const store = useDocumentsStore()
    const b = await store.bundle(['s1'])

    expect(b.innerFiles).toEqual([])
  })

  it('downloads one inner file by container id + encoded name', async () => {
    mockDownload.mockResolvedValue(undefined)

    const store = useDocumentsStore()
    await store.downloadInner('cont-1', 'my report.pdf')

    expect(mockDownload).toHaveBeenCalledWith('/documents/cont-1/data-objects/my%20report.pdf')
  })

  // The document screen reads the chain from its OWN endpoint, never from the
  // dashboard listing — the listing subtracts a chain an envelope covers, which
  // is how a completed signing came to render as an unsigned draft.
  it('reads one chain by any id in it, from the chain endpoint', async () => {
    mockGet.mockResolvedValue({
      chainRootId: 'doc-1',
      id: 'doc-1',
      kind: 'container',
      status: 'signed',
      hasSignatures: true,
      platformSigned: true,
      innerFiles: [{ name: 'a.pdf' }],
    })

    const store = useDocumentsStore()
    const c = await store.chain('doc-1')

    expect(mockGet).toHaveBeenCalledWith('/documents/doc-1/chain')
    expect(c.platformSigned).toBe(true)
    expect(c.innerFiles).toEqual([{ name: 'a.pdf' }])
  })
})
