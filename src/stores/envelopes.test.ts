import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEnvelopesStore } from './envelopes'
import { api, ApiError } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn(), download: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)
const mockDownload = vi.mocked(api.download)

describe('envelopes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads the list and marks ready when there are envelopes', async () => {
    mockGet.mockResolvedValue({ envelopes: [{ id: 'env-1', status: 'sent', version: 1 }] })

    const store = useEnvelopesStore()
    await store.loadList()

    expect(mockGet).toHaveBeenCalledWith('/envelopes')
    expect(store.listState).toBe('ready')
    expect(store.items).toHaveLength(1)
  })

  it('marks the list empty when the user has none', async () => {
    mockGet.mockResolvedValue({ envelopes: [] })

    const store = useEnvelopesStore()
    await store.loadList()

    expect(store.listState).toBe('empty')
  })

  it('maps a list failure to a safe key without exposing the body', async () => {
    mockGet.mockRejectedValue(new ApiError(502, 'upstream_error', { secret: 'nope' }))

    const store = useEnvelopesStore()
    await store.loadList()

    expect(store.listState).toBe('error')
    expect(store.listError).toBe('errors.upstream')
    expect(store.items).toHaveLength(0)
  })

  it('loads the signer inbox and marks ready when the user has tasks awaiting them', async () => {
    mockGet.mockResolvedValue({
      tasks: [
        { envelope: { id: 'env-9', title: 'NDA', status: 'sent', version: 2 }, slotId: 's-2', orderIndex: 2, slotStatus: 'sent', yourTurn: true },
      ],
    })

    const store = useEnvelopesStore()
    await store.loadTasks()

    expect(mockGet).toHaveBeenCalledWith('/signing-tasks')
    expect(store.tasksState).toBe('ready')
    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0].yourTurn).toBe(true)
  })

  it('marks the signer inbox empty when nothing awaits the user', async () => {
    mockGet.mockResolvedValue({ tasks: [] })

    const store = useEnvelopesStore()
    await store.loadTasks()

    expect(store.tasksState).toBe('empty')
    expect(store.tasks).toHaveLength(0)
  })

  it('loads the composed detail view', async () => {
    mockGet.mockResolvedValue({
      envelope: { id: 'env-1', status: 'sent', version: 2, orderPolicy: 'sequential' },
      slots: [{ id: 's-1', orderIndex: 0, role: 'owner' }],
      documents: [{ documentId: 'doc-1' }],
    })

    const store = useEnvelopesStore()
    await store.loadDetail('env-1')

    expect(mockGet).toHaveBeenCalledWith('/envelopes/env-1')
    expect(store.detailState).toBe('ready')
    expect(store.detail?.slots).toHaveLength(1)
  })

  it('creates then sends an envelope in one commit and returns the created envelope', async () => {
    mockPost.mockResolvedValueOnce({ id: 'env-9', status: 'draft', version: 1, slotIds: ['s-1'] }) // create
    mockPost.mockResolvedValueOnce({ id: 'env-9', status: 'sent', version: 2 }) // send

    const store = useEnvelopesStore()
    const created = await store.createAndSend({
      title: 'Q3',
      orderPolicy: 'sequential',
      documents: ['doc-1'],
      slots: [{ orderIndex: 0, role: 'owner' }],
    })

    expect(created.id).toBe('env-9')
    // The slot ids ride through — a self-sign routes straight into its own slot.
    expect(created.slotIds).toEqual(['s-1'])
    expect(mockPost).toHaveBeenNthCalledWith(1, '/envelopes', expect.objectContaining({ documents: ['doc-1'] }))
    expect(mockPost).toHaveBeenNthCalledWith(2, '/envelopes/env-9/send')
  })

  it('resolves the envelopes covering one document', async () => {
    mockGet.mockResolvedValueOnce({
      envelopes: [{ id: 'env-7', status: 'completed', version: 2, docIds: ['doc-7'], slotCount: 1, signedCount: 1 }],
    })

    const store = useEnvelopesStore()
    const found = await store.findForDocument('doc-7')

    expect(mockGet).toHaveBeenCalledWith('/envelopes?documentId=doc-7')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('env-7')
    expect(found[0].docIds).toEqual(['doc-7'])
  })

  it('attaches a document and adds a slot to a draft envelope', async () => {
    mockPost.mockResolvedValueOnce({ documentId: 'doc-1' }) // attach
    mockPost.mockResolvedValueOnce({ id: 's-2' }) // add slot

    const store = useEnvelopesStore()
    await store.attachDocument('env-1', 'doc-1')
    const slotId = await store.addSlot('env-1', { orderIndex: 1, role: 'cosigner', identityRef: 'name@example.lv' })

    expect(mockPost).toHaveBeenNthCalledWith(1, '/envelopes/env-1/documents', { documentId: 'doc-1' })
    expect(mockPost).toHaveBeenNthCalledWith(2, '/envelopes/env-1/slots', {
      orderIndex: 1,
      role: 'cosigner',
      identityRef: 'name@example.lv',
    })
    expect(slotId).toBe('s-2')
  })

  it('cancels and reloads the detail so the new state shows', async () => {
    mockPost.mockResolvedValue({ id: 'env-1', status: 'cancelled' })
    mockGet.mockResolvedValue({
      envelope: { id: 'env-1', status: 'cancelled', version: 3 },
      slots: [],
      documents: [],
    })

    const store = useEnvelopesStore()
    await store.cancel('env-1')

    expect(mockPost).toHaveBeenCalledWith('/envelopes/env-1/cancel')
    expect(mockGet).toHaveBeenCalledWith('/envelopes/env-1')
    expect(store.detail?.envelope.status).toBe('cancelled')
  })

  it('declines a slot through the slot endpoint and reloads', async () => {
    mockPost.mockResolvedValue({ id: 'env-1' })
    mockGet.mockResolvedValue({
      envelope: { id: 'env-1', status: 'sent', version: 2 },
      slots: [{ id: 's-2', orderIndex: 1, status: 'declined' }],
      documents: [],
    })

    const store = useEnvelopesStore()
    await store.declineSlot('env-1', 's-2')

    expect(mockPost).toHaveBeenCalledWith('/envelopes/env-1/slots/s-2/decline')
    expect(mockGet).toHaveBeenCalledWith('/envelopes/env-1')
  })

  it('downloads the signed container through the credentialed path', async () => {
    mockDownload.mockResolvedValue(undefined)

    const store = useEnvelopesStore()
    await store.download('container-1')

    expect(mockDownload).toHaveBeenCalledWith('/documents/container-1/download')
  })

  // A further signature on a container the user already signed through an envelope
  // joins THAT envelope: one workflow home per chain, rather than a dashboard row per
  // signature. The reopen -> add slot -> send order matters — the SEND is what grants
  // the new signer access to the document, so a round that skipped it would leave a
  // slot whose signer cannot read what they must sign.
  it('reopens the completed envelope that already covers the container', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/envelopes?documentId=')) {
        return { envelopes: [{ id: 'env-old', status: 'completed', version: 3 }] }
      }

      return {
        envelope: { id: 'env-old', status: 'sent', version: 5 },
        slots: [
          { id: 'slot-1', status: 'signed' },
          { id: 'slot-2', status: 'pending' },
        ],
        documents: [],
      }
    })
    mockPost.mockImplementation(async (url: string) => {
      if (url.endsWith('/reopen')) return { id: 'env-old', status: 'draft', version: 4 }
      if (url.endsWith('/slots')) return { id: 'slot-2' }

      return {}
    })

    const store = useEnvelopesStore()
    const created = await store.sendForSignature({
      title: 'contract.asice',
      documents: ['doc-1'],
      slots: [{ orderIndex: 0, role: 'signer' }],
    })

    const posted = mockPost.mock.calls.map((c) => c[0])
    expect(posted).toEqual([
      '/envelopes/env-old/reopen',
      '/envelopes/env-old/slots',
      '/envelopes/env-old/send',
    ])
    expect(created.id).toBe('env-old')
    // The slots this round added are the unsigned ones; the signed one is the previous
    // round's record and must not be handed back as somewhere to sign.
    expect(created.slotIds).toEqual(['slot-2'])
  })

  // Everything else creates, as before: no covering envelope, one still running, or a
  // lookup that fails. The last case is deliberate — refusing to sign because a lookup
  // broke would be a worse outcome than an extra envelope.
  it.each([
    ['no covering envelope', { envelopes: [] }, undefined],
    ['a round still in progress', { envelopes: [{ id: 'env-live', status: 'sent', version: 1 }] }, undefined],
    ['a lookup that fails', undefined, new ApiError(500, 'err:request:internal', null)],
  ])('creates a new envelope when there is %s', async (_name, lookup, lookupError) => {
    mockGet.mockImplementation(async () => {
      if (lookupError) throw lookupError

      return lookup
    })
    mockPost.mockImplementation(async (url: string) => {
      if (url === '/envelopes') return { id: 'env-new', status: 'draft', version: 1, slotIds: ['s1'] }

      return {}
    })

    const store = useEnvelopesStore()
    const created = await store.sendForSignature({
      title: 'contract.asice',
      documents: ['doc-1'],
      slots: [{ orderIndex: 0, role: 'signer' }],
    })

    expect(created.id).toBe('env-new')
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/envelopes', '/envelopes/env-new/send'])
  })
})
