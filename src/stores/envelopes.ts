import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/lib/api'

// One envelope as it appears in a listing. The owner subject and storage internals
// never reach the browser — only what the list and tracking views render. createdAt is
// when it began; slotCount/signedCount give "n of N signed", and yourTurn is true when it
// is the owner's turn to sign one of their own slots — together they drive the dashboard
// progress badge.
export interface EnvelopeSummary {
  id: string
  title?: string
  status: string
  orderPolicy?: string
  version: number
  createdAt?: string
  updatedAt?: string
  // The envelope's attached document ids — how a listing consumer (the dashboard,
  // the hub) connects an envelope to the document chain it covers.
  docIds?: string[]
  slotCount?: number
  signedCount?: number
  yourTurn?: boolean
  // When the SOONEST of the envelope's documents auto-deletes (stamped by the
  // composed dashboard read). Absent when no document's retention is known — the
  // row then states no time-to-live rather than inventing one.
  retentionUntil?: string
}

// One document attached to an envelope (a reference, never the bytes). filename is
// resolved by the BFF for display and may be absent (the view falls back to the id).
export interface EnvelopeDocRef {
  documentId: string
  contentHash?: string
  filename?: string
}

// The envelope header in the composed detail view. createdAt is when the envelope began.
export interface EnvelopeHeader {
  id: string
  owner?: string
  title?: string
  status: string
  orderPolicy?: string
  version: number
  createdAt?: string
}

// One signer slot in the composed view: the envelope service's slot fields plus the
// live signing state the BFF merges in from the slot's backing job (state/containerId).
export interface ComposedSlot {
  id: string
  orderIndex: number
  role?: string
  flow?: string
  requiredLoa?: string
  status?: string
  jobId?: string
  signatureId?: string
  signedDocRef?: string
  // signedAt orders the signings on the trail; absent until the slot signs.
  signedAt?: string
  state?: string
  containerId?: string
  // The BFF marks the viewing user's own slot (the invited signer matched by their
  // eIDAS identity, or the owner's slot), so the tracking page shows "your turn" and
  // the sign action against the right slot — the viewer may be a co-signer, not the owner.
  you?: boolean
  // signerName is the signer's display name once they have participated (captured from
  // their own authenticated session). identityRef is the invited identity code, present
  // only for the owner viewing their own envelope (the codes they entered) — never another
  // party's.
  signerName?: string
  identityRef?: string
}

// The composed envelope view: header + ordered slots + attached documents, returned
// by the BFF in one call (it enriches each slot with its live signing state).
export interface EnvelopeDetail {
  envelope: EnvelopeHeader
  slots: ComposedSlot[]
  documents: EnvelopeDocRef[]
}

// One signer slot to seed at envelope creation. The owner is derived from the
// session by the envelope service and is never supplied here.
export interface SlotDraft {
  orderIndex: number
  role?: string
  flow?: string
  requiredLoa?: string
  identityRef?: string
}

// The request to build an envelope. Documents + slots seed it at creation so the
// guided flow needs one create call plus a send.
export interface CreateInput {
  title?: string
  orderPolicy?: 'sequential' | 'parallel'
  profile?: string
  documents?: string[]
  slots?: SlotDraft[]
}

export interface Created {
  id: string
  status: string
  version: number
  slotIds?: string[]
}

interface ListResult {
  envelopes: EnvelopeSummary[]
  nextCursor?: string
}

// One entry in the signer inbox: an envelope a different person has invited the user to
// sign, the user's own slot, and whether it is their turn under the ordering policy. The
// owner subject is never carried — only what "Awaiting your signature" renders.
export interface SigningTask {
  envelope: EnvelopeSummary
  slotId: string
  orderIndex: number
  slotStatus: string
  slotFlow?: string
  yourTurn: boolean
}

interface SigningTasksResult {
  tasks: SigningTask[]
  nextCursor?: string
}

// idle before the first load; ready/empty distinguish a loaded-with-rows list from a
// loaded-but-empty one so the view shows the right state.
type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

// Maps a failed call to a stable i18n key the view renders — never the raw body.
function messageKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'errors.session'
    if (err.status >= 500 || err.status === 502) return 'errors.upstream'
  }

  return 'errors.generic'
}

function enc(s: string): string {
  return encodeURIComponent(s)
}

export const useEnvelopesStore = defineStore('envelopes', () => {
  const items = ref<EnvelopeSummary[]>([])
  const listState = ref<LoadState>('idle')
  const listError = ref<string | null>(null)

  const tasks = ref<SigningTask[]>([])
  const tasksState = ref<LoadState>('idle')
  const tasksError = ref<string | null>(null)

  const detail = ref<EnvelopeDetail | null>(null)
  const detailState = ref<LoadState>('idle')
  const detailError = ref<string | null>(null)

  // Load (or reload) the user's envelopes. Sets `empty` rather than `ready` when the
  // user has none so the view shows the empty state, not an empty table.
  async function loadList(): Promise<void> {
    listState.value = 'loading'
    listError.value = null
    try {
      const res = await api.get<ListResult>('/envelopes')
      items.value = res.envelopes ?? []
      listState.value = items.value.length > 0 ? 'ready' : 'empty'
    } catch (err) {
      items.value = []
      listState.value = 'error'
      listError.value = messageKey(err)
    }
  }

  // Load (or reload) the signer inbox — the envelopes awaiting the user's signature as an
  // invited co-signer (a different person from the owner). Empty when the user has none.
  async function loadTasks(): Promise<void> {
    tasksState.value = 'loading'
    tasksError.value = null
    try {
      const res = await api.get<SigningTasksResult>('/signing-tasks')
      tasks.value = res.tasks ?? []
      tasksState.value = tasks.value.length > 0 ? 'ready' : 'empty'
    } catch (err) {
      tasks.value = []
      tasksState.value = 'error'
      tasksError.value = messageKey(err)
    }
  }

  // Load the composed detail view of one envelope (header, slots with live signing
  // state, documents).
  async function loadDetail(id: string): Promise<void> {
    detailState.value = 'loading'
    detailError.value = null
    try {
      detail.value = await api.get<EnvelopeDetail>(`/envelopes/${enc(id)}`)
      detailState.value = 'ready'
    } catch (err) {
      detail.value = null
      detailState.value = 'error'
      detailError.value = messageKey(err)
    }
  }

  // Create an envelope seeded with its documents + slots. Errors propagate so the
  // guided flow can surface them without disturbing any loaded list/detail.
  async function create(input: CreateInput): Promise<Created> {
    return api.post<Created>('/envelopes', input)
  }

  // Attach an existing document to a draft envelope.
  async function attachDocument(id: string, documentId: string): Promise<void> {
    await api.post(`/envelopes/${enc(id)}/documents`, { documentId })
  }

  // Add a signer slot to a draft envelope, returning its new slot id.
  async function addSlot(id: string, slot: SlotDraft): Promise<string> {
    const res = await api.post<{ id: string }>(`/envelopes/${enc(id)}/slots`, slot)

    return res.id
  }

  // Move an envelope out of draft into the active signing lifecycle.
  async function send(id: string): Promise<void> {
    await api.post(`/envelopes/${enc(id)}/send`)
  }

  // Resolve the envelopes covering one document that the user may see — as owner,
  // or as a matched participant on a non-draft envelope — newest first. How the
  // document hub answers "which envelope carries this document?". Errors propagate;
  // the hub falls back to its standalone-chain shape.
  async function findForDocument(documentId: string): Promise<EnvelopeSummary[]> {
    const res = await api.get<{ envelopes: EnvelopeSummary[] }>(
      `/envelopes?documentId=${enc(documentId)}`,
    )

    return res.envelopes ?? []
  }

  // Create the envelope and send it in one step — the guided flow's commit. Returns
  // the created envelope (id + slot ids) so the caller can route to its tracking
  // page, or straight into its own slot's signing screen for a self-sign.
  async function createAndSend(input: CreateInput): Promise<Created> {
    const created = await create(input)
    await send(created.id)

    return created
  }

  // Owner action: reopen a COMPLETED envelope so a further signature joins the
  // workflow that already covers the container, instead of a second envelope being
  // minted over the same chain. Answers the envelope in draft; the caller then adds
  // the slot and sends, and the SEND is what grants the new signer access to the
  // document — so a reopen is never the whole act.
  async function reopen(id: string): Promise<Created> {
    return api.post<Created>(`/envelopes/${enc(id)}/reopen`)
  }

  // The guided flow's commit for a signing that may be the FIRST on this container or
  // a further one. A container that a completed envelope of the user's already covers
  // takes another round on that envelope: reopen, add the slot, send. Anything else —
  // no covering envelope, or one that is still running, or someone else's — creates a
  // new one as before.
  //
  // Why the caller does not decide this: the wizard cannot know whether the container
  // it holds has been signed through an envelope before (it may have been entered from
  // the hub, or adopted from an upload), so asking the server is the only honest answer.
  // A lookup failure falls back to creating, because refusing to sign would be a worse
  // outcome than an extra row.
  async function sendForSignature(input: CreateInput): Promise<Created> {
    const documentId = input.documents?.[0]
    if (documentId) {
      try {
        const covering = await findForDocument(documentId)
        // Completed only: a running envelope is a round in progress, and a declined or
        // cancelled one is closed for a reason that is not "another signature".
        const reopenable = covering.find((e) => e.status === 'completed')
        if (reopenable) {
          const back = await reopen(reopenable.id)
          for (const [i, slot] of (input.slots ?? []).entries()) {
            await addSlot(reopenable.id, { ...slot, orderIndex: slot.orderIndex ?? i })
          }
          await send(reopenable.id)
          await loadDetail(reopenable.id)

          return { ...back, id: reopenable.id, slotIds: newSlotIds(reopenable.id) }
        }
      } catch {
        // Fall through to creating: an unreadable lookup must not block a signature.
      }
    }

    return createAndSend(input)
  }

  // newSlotIds reads back the slots this round added — the ones with no signature yet.
  // The create path gets slot ids in its response; a reopened round does not, because
  // the slots were added one by one, so they are read from the refreshed detail.
  function newSlotIds(id: string): string[] {
    if (detail.value?.envelope.id !== id) {
      return []
    }

    return detail.value.slots.filter((s) => s.status !== 'signed').map((s) => s.id)
  }

  // Owner action: cancel the whole envelope. Reloads the detail so the view reflects
  // the new lifecycle state.
  async function cancel(id: string): Promise<void> {
    await api.post(`/envelopes/${enc(id)}/cancel`)
    await loadDetail(id)
  }

  // Signer action: decline a slot. Reloads the detail so the slot shows as declined.
  async function declineSlot(id: string, slotId: string): Promise<void> {
    await api.post(`/envelopes/${enc(id)}/slots/${enc(slotId)}/decline`)
    await loadDetail(id)
  }

  // Stream the signed container to disk through the credentialed file path (the BFF
  // records the access event). Used once the envelope is fully signed.
  async function download(containerId: string): Promise<void> {
    await api.download(`/documents/${enc(containerId)}/download`)
  }

  return {
    items,
    listState,
    listError,
    tasks,
    tasksState,
    tasksError,
    loadTasks,
    detail,
    detailState,
    detailError,
    loadList,
    loadDetail,
    create,
    attachDocument,
    addSlot,
    send,
    findForDocument,
    createAndSend,
    reopen,
    sendForSignature,
    cancel,
    declineSlot,
    download,
  }
})
