import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/lib/api'
import type { ChainRow } from '@/stores/dashboard'
import type { Validation } from '@/stores/signing'

// One document in the user's library, as the portal API projects it. Bytes,
// owner subject, and storage internals never appear here — only what the library
// view renders and the lifecycle/retention fields that drive its states.
export interface DocumentSummary {
  id: string
  filename: string
  mime: string
  size: number
  status: string
  preservationClass: string
  retentionUntil: string
  createdAt: string
}

interface DocumentList {
  documents: DocumentSummary[]
  count: number
}

// The single-document metadata endpoint's projection — narrower than the list
// row (no lifecycle/retention fields), but it has what a signing screen needs
// to pick a signature format.
export interface DocumentMeta {
  id: string
  filename: string
  mime: string
  size?: number
  // The document's kind ('source' | 'pdf' | 'container') and lifecycle status —
  // how the wizard tells a SIGNED artifact (immutable contents; bundles as an
  // annex data object) from an unsigned draft it may rebundle.
  kind?: string
  status?: string
  // Present + non-empty for a container (a bundle): its inner files. Absent for a
  // plain source — the signal the wizard uses to stage an existing draft as a bundle.
  innerFiles?: InnerFile[]
}

// The upload response's acknowledgement: the new document's id, and whether the
// file already carried a signature (structural detection only — not verified).
export interface UploadResult {
  id: string
  hasSignatures: boolean
}

// One data object inside an ASiC-E container — its in-container name, media type,
// and size. The "what's inside" listing the wizard renders; bytes are fetched on
// demand (preview / download an original).
export interface InnerFile {
  name: string
  mediaType?: string
  size?: number
}

// The bundle / rebundle response: the unsigned container row plus what's inside it.
export interface Bundle {
  id: string
  filename: string
  mime: string
  size: number
  innerFiles: InnerFile[]
}

// One entry of a rebundle, in final order: an existing inner file kept by name, or a
// newly staged loose source added (and absorbed) by id.
export interface BundleEntry {
  name?: string
  sourceId?: string
}

// The normalized on-demand validation answer, as the portal API relays it —
// the SAME wire shape the signing flow's report uses (one answer shape from
// either flow), so the full report can render from an on-demand validate too.
export type ValidationAnswer = Validation

// idle before the first load; ready/empty distinguish a loaded-with-rows list from
// a loaded-but-empty one so the view can show the right state.
type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

// Maps a failed call to a stable i18n key the view renders — never the raw body.
function messageKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'errors.session'
    if (err.status >= 500 || err.status === 502) return 'errors.upstream'
  }

  return 'errors.generic'
}

export const useDocumentsStore = defineStore('documents', () => {
  const items = ref<DocumentSummary[]>([])
  const state = ref<LoadState>('idle')
  const errorKey = ref<string | null>(null)

  // Load (or reload) the library. Sets `empty` rather than `ready` when the user
  // has no documents so the view shows the empty state, not an empty table.
  async function load(): Promise<void> {
    state.value = 'loading'
    errorKey.value = null
    try {
      const res = await api.get<DocumentList>('/documents')
      items.value = res.documents ?? []
      state.value = items.value.length > 0 ? 'ready' : 'empty'
    } catch (err) {
      items.value = []
      state.value = 'error'
      errorKey.value = messageKey(err)
    }
  }

  // Upload a file on the user's behalf, then refresh the list so the new row (with
  // its server-assigned status and retention) appears. Errors propagate to the
  // caller so the upload affordance can show them without disturbing the list.
  // Returns whether the file already carried a signature, so the caller can
  // decide what to do with that (e.g. flag it before the user signs again).
  //
  // The mime is sent explicitly (not left to the multipart part's own
  // Content-Type) because the BFF re-encodes the upload before forwarding it to
  // the document service, and that re-encoding always stamps
  // application/octet-stream — the browser's real type would otherwise be lost.
  async function upload(file: File): Promise<UploadResult> {
    const form = new FormData()
    form.append('file', file)
    if (file.type) form.append('mime', file.type)
    const res = await api.postForm<{ id: string; hasSignatures?: boolean }>('/documents', form)
    await load()

    return { id: res.id, hasSignatures: res.hasSignatures ?? false }
  }

  // Eagerly package staged loose sources into ONE unsigned ASiC-E container — the
  // draft-save commit point: 2+ files (and a single non-PDF) become a container the
  // moment they are staged, so an abandoned wizard leaves one bundle row rather than
  // a pile of loose drafts. The loose sources are absorbed server-side.
  async function bundle(sourceIds: string[]): Promise<Bundle> {
    const res = await api.post<Bundle>('/documents/bundle', { sourceIds })

    return { ...res, innerFiles: res.innerFiles ?? [] }
  }

  // Rebuild an unsigned bundle from entries in final order — a draft edit (add /
  // remove / reorder): existing inner files kept by name, newly staged sources added
  // by id and absorbed.
  async function rebundle(id: string, entries: BundleEntry[]): Promise<Bundle> {
    const res = await api.post<Bundle>(`/documents/${encodeURIComponent(id)}/rebundle`, { entries })

    return { ...res, innerFiles: res.innerFiles ?? [] }
  }

  // Stream one inner file out of a container to disk (download an original). The
  // portal API records the access event.
  async function downloadInner(id: string, name: string): Promise<void> {
    await api.download(
      `/documents/${encodeURIComponent(id)}/data-objects/${encodeURIComponent(name)}`,
    )
  }

  // Delete one document and drop it from the list optimistically on success.
  async function remove(id: string): Promise<void> {
    await api.del(`/documents/${encodeURIComponent(id)}`)
    items.value = items.value.filter((d) => d.id !== id)
    if (items.value.length === 0 && state.value === 'ready') state.value = 'empty'
  }

  // Stream a document's bytes to disk. The portal API records the access event.
  async function download(id: string): Promise<void> {
    await api.download(`/documents/${encodeURIComponent(id)}/download`)
  }

  // Fetch one document's metadata directly — used where the caller needs a
  // document not already in the loaded library (e.g. a co-signer picking up
  // someone else's document to sign).
  async function get(id: string): Promise<DocumentMeta> {
    return api.get<DocumentMeta>(`/documents/${encodeURIComponent(id)}`)
  }

  // Read ONE document chain as its live head, addressed by any id in it (its
  // root or its signed head). This is the document screen's source of truth: the
  // dashboard listing subtracts a chain an envelope covers and it pages, so a
  // screen that took its facts from there loses them the moment a workflow
  // touches the document.
  async function chain(id: string): Promise<ChainRow> {
    return api.get<ChainRow>(`/documents/${encodeURIComponent(id)}/chain`)
  }

  // Refresh a signed document with a qualified archive timestamp (extends how
  // long its signatures stay verifiable). The document keeps its id — the
  // platform replaces its bytes in place with the archived form.
  async function archiveTimestamp(id: string): Promise<void> {
    await api.post(`/documents/${encodeURIComponent(id)}/archive-timestamp`, {})
  }

  // Render-first: the answer a validate just produced, kept per document for a
  // short window so a repeat Validate press renders it without any request at
  // all (validation is time-anchored — the answer carries its validatedAt and
  // is shown "as of" that moment). An explicit re-validate bypasses this.
  const answerTTLMs = 5 * 60 * 1000
  const recentAnswers = new Map<string, { answer: ValidationAnswer; at: number }>()

  // Validate a signed document on demand (e.g. a file uploaded already signed)
  // and return the normalized answer. Nothing is stored server-side — ask again
  // anytime; a repeat ask within the window renders the recent answer, and
  // { force: true } (the explicit re-validate) runs a fresh round.
  async function validate(id: string, opts?: { force?: boolean }): Promise<ValidationAnswer> {
    const held = recentAnswers.get(id)
    if (!opts?.force && held && Date.now() - held.at < answerTTLMs) {
      return held.answer
    }
    const suffix = opts?.force ? '?force=1' : ''
    const answer = await api.post<ValidationAnswer>(
      `/documents/${encodeURIComponent(id)}/validate${suffix}`,
      {},
    )
    recentAnswers.set(id, { answer, at: Date.now() })

    return answer
  }

  return {
    items,
    state,
    errorKey,
    load,
    upload,
    remove,
    download,
    get,
    chain,
    archiveTimestamp,
    validate,
    bundle,
    rebundle,
    downloadInner,
  }
})
