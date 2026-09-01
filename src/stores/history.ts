import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/lib/api'

// One record in the user's history: a chain whose storage was destroyed (the
// files are gone — nothing can be downloaded, signed, or re-validated), kept as
// a metadata record for the platform's bounded window, then erased.
export interface HistoryRow {
  chainRootId: string
  id: string
  kind: string
  status: string
  filename?: string
  mime: string
  size: number
  hasSignatures: boolean
  platformSigned: boolean
  chainCreatedAt: string
  destroyedAt: string
}

interface HistoryList {
  chains: HistoryRow[]
  count: number
}

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

// Maps a failed call to a stable i18n key the view renders — never the raw body.
function messageKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'errors.session'
    if (err.status >= 500 || err.status === 502) return 'errors.upstream'
  }

  return 'errors.generic'
}

export const useHistoryStore = defineStore('history', () => {
  const rows = ref<HistoryRow[]>([])
  const state = ref<LoadState>('idle')
  const errorKey = ref<string | null>(null)
  // The page size drives the pager: a full page means there may be older records.
  const pageSize = 25

  // Load one page. after is the exclusive upper-bound chain root id ("" = the
  // newest page) — the caller keeps its own cursor stack for newer/older.
  async function load(after = ''): Promise<void> {
    state.value = 'loading'
    errorKey.value = null
    try {
      const q = after ? `?limit=${pageSize}&after=${encodeURIComponent(after)}` : `?limit=${pageSize}`
      const res = await api.get<HistoryList>(`/history${q}`)
      rows.value = res.chains ?? []
      state.value = rows.value.length > 0 ? 'ready' : 'empty'
    } catch (err) {
      rows.value = []
      state.value = 'error'
      errorKey.value = messageKey(err)
    }
  }

  // Erase one record early (irreversible — the record is all that is left).
  async function remove(chainRootId: string): Promise<void> {
    await api.del(`/history/${encodeURIComponent(chainRootId)}`)
    rows.value = rows.value.filter((r) => r.chainRootId !== chainRootId)
    if (rows.value.length === 0 && state.value === 'ready') state.value = 'empty'
  }

  return { rows, state, errorKey, pageSize, load, remove }
})
