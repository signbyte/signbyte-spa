import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/lib/api'

// One rendered page in a document preview: its position and pixel dimensions (so a
// viewer can reserve the right box before the image arrives) plus the render
// service's own reference. The page bytes are always fetched by index through the
// portal API, never from this reference directly.
export interface PreviewPage {
  index: number
  width: number
  height: number
  imageRef: string
}

// The preview manifest for a document. A previewable document reports renderable
// true with its page list; a type that cannot be rendered reports renderable false
// with a machine reason (and its mime), so the view can offer download-to-review
// rather than surface an error.
export interface PreviewManifest {
  documentId: string
  format?: string
  pageCount?: number
  pages?: PreviewPage[]
  textLayerRef?: string
  renderable: boolean
  reason?: string
  mime?: string
  expiresAt?: string
}

// The extracted plain-text layer, one string per page — for screen readers and
// search. Best-effort: its absence never blocks the visual preview.
interface TextLayer {
  documentId: string
  pages: string[]
}

// idle before the first load; ready holds a renderable manifest; unsupported is the
// typed not-renderable result (a clean download-to-review state, not a failure);
// error is a transport or authorization failure.
type PreviewState = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error'

// Maps a failed call to a stable i18n key the view renders — never the raw body.
function messageKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'errors.session'
    if (err.status >= 500 || err.status === 502) return 'errors.upstream'
  }

  return 'errors.generic'
}

export const usePreviewStore = defineStore('preview', () => {
  const state = ref<PreviewState>('idle')
  const manifest = ref<PreviewManifest | null>(null)
  const text = ref<string[]>([])
  const errorKey = ref<string | null>(null)
  const reason = ref<string | null>(null)

  // Load the preview manifest, rendered on the user's behalf, from a preview base
  // path — `/documents/{id}/preview` for a whole document, or
  // `/documents/{id}/data-objects/{name}/preview` for one inner file of a container.
  // The pages and text layer hang off it (`/pages/{n}`, `/text`). A not-renderable
  // type is a normal outcome (the unsupported state), not an error; only a
  // transport/authorization failure sets the error state.
  async function load(base: string): Promise<void> {
    state.value = 'loading'
    manifest.value = null
    text.value = []
    errorKey.value = null
    reason.value = null
    try {
      const m = await api.get<PreviewManifest>(base)
      manifest.value = m
      if (m.renderable) {
        state.value = 'ready'
        // Fire-and-forget: the visual preview must not wait on the text layer.
        void loadText(base)
      } else {
        reason.value = m.reason ?? 'unsupported_format'
        state.value = 'unsupported'
      }
    } catch (err) {
      state.value = 'error'
      errorKey.value = messageKey(err)
    }
  }

  // Fetch the plain-text layer for screen readers. Best-effort: a missing layer
  // (404) or any failure simply leaves the preview image-only.
  async function loadText(base: string): Promise<void> {
    try {
      const layer = await api.get<TextLayer>(`${base}/text`)
      text.value = layer.pages ?? []
    } catch {
      text.value = []
    }
  }

  // Drop any loaded preview so a new document starts clean.
  function reset(): void {
    state.value = 'idle'
    manifest.value = null
    text.value = []
    errorKey.value = null
    reason.value = null
  }

  return { state, manifest, text, errorKey, reason, load, reset }
})
