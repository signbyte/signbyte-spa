import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError } from '@/lib/api'
import type { InnerFile } from './documents'
import type { EnvelopeSummary, SigningTask } from './envelopes'

// One standalone document chain, collapsed to its single live head — the signed
// artifact where one exists, else the uploaded source. The dashboard's
// "always latest" row: a chain never renders as its source next to its signed
// result, and a chain covered by an envelope never appears here at all (the
// portal API subtracts it in favor of the envelope's own row).
export interface ChainRow {
  chainRootId: string
  id: string
  kind: string
  status: string
  filename?: string
  mime: string
  size: number
  // hasSignatures: the head carries signatures (including a file uploaded
  // already signed). platformSigned: the head was produced by a signing here —
  // false on a pre-signed upload, so hasSignatures && !platformSigned reads as
  // a draft that can be validated or co-signed as-is.
  hasSignatures: boolean
  platformSigned: boolean
  // resultFrozen: a signing workflow over the chain is in progress — the signed
  // result is download-locked until the workflow's terminal transition, so the
  // row renders as "in signing" rather than draft/completed.
  resultFrozen?: boolean
  // none|b_lt|preservation — 'preservation' once the container has been
  // archive-timestamped (B-LTA). Lets the activity trail show "archived" as a
  // durable fact that survives navigation, sourced from the chain projection.
  preservationClass?: string
  // The head container's inner files. Carried by the single-chain read (the
  // document screen's source), so "what's inside" arrives in the same call; the
  // dashboard listing leaves it absent.
  innerFiles?: InnerFile[]
  retentionUntil: string
  chainCreatedAt: string
  createdAt: string
  updatedAt: string
}

// The composed library view the portal API assembles in one call: the signer
// inbox, the user's envelopes, and their standalone chains — with the row model
// (one row per envelope or chain) already enforced server-side.
interface DashboardResult {
  tasks: SigningTask[]
  envelopes: EnvelopeSummary[]
  chains: ChainRow[]
}

// idle before the first load; ready/empty distinguish a loaded-with-rows result
// from a loaded-but-empty one so the view shows the right state.
type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

// Maps a failed call to a stable i18n key the view renders — never the raw body.
function messageKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'errors.session'
    if (err.status >= 500 || err.status === 502) return 'errors.upstream'
  }

  return 'errors.generic'
}

export const useDashboardStore = defineStore('dashboard', () => {
  const tasks = ref<SigningTask[]>([])
  const envelopes = ref<EnvelopeSummary[]>([])
  const chains = ref<ChainRow[]>([])
  const state = ref<LoadState>('idle')
  const errorKey = ref<string | null>(null)

  const isEmpty = computed(
    () => tasks.value.length === 0 && envelopes.value.length === 0 && chains.value.length === 0,
  )

  // Load (or reload) the composed dashboard. One call — the portal API composes
  // the three lists and subtracts envelope-covered chains.
  async function load(): Promise<void> {
    state.value = 'loading'
    errorKey.value = null
    try {
      const res = await api.get<DashboardResult>('/dashboard')
      tasks.value = res.tasks ?? []
      envelopes.value = res.envelopes ?? []
      chains.value = res.chains ?? []
      state.value = isEmpty.value ? 'empty' : 'ready'
    } catch (err) {
      tasks.value = []
      envelopes.value = []
      chains.value = []
      state.value = 'error'
      errorKey.value = messageKey(err)
    }
  }

  // Find one chain row by its head document id — the hub view's data source
  // when the user arrives from a dashboard row (a deep link falls back to the
  // metadata endpoint).
  function chainByHead(id: string): ChainRow | null {
    return chains.value.find((c) => c.id === id) ?? null
  }

  // Find one chain row by EITHER its head id or its chain-root (source) id. A
  // dashboard row links by head id, but the hub is also reached by the source
  // id — a redirect off the sign route, or a bookmarked /documents/{source}
  // link — and both must resolve to the same collapsed chain (else a completed
  // chain reached by its source id renders as an unsigned draft).
  function chainForId(id: string): ChainRow | null {
    return chains.value.find((c) => c.id === id || c.chainRootId === id) ?? null
  }

  return { tasks, envelopes, chains, state, errorKey, isEmpty, load, chainByHead, chainForId }
})
