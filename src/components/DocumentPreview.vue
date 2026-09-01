<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/api'
import { usePreviewStore } from '@/stores/preview'

// Review-only document preview: the inert page images a signer reads before they
// commit — what you see is what you sign. The bytes are produced by the platform's
// sandboxed render service and streamed through the portal API on the user's behalf;
// this component only ever shows images plus an optional screen-reader text layer,
// never an interpretable document. A type that cannot be rendered falls back to
// download-to-review, and a failure offers a retry.
const props = defineProps<{ documentId: string; filename?: string; innerName?: string }>()
const emit = defineEmits<{ download: [] }>()
const { t } = useI18n()
const preview = usePreviewStore()

const page = ref(0)
const imgLoading = ref(true)
const imgError = ref(false)

const pageCount = computed(
  () => preview.manifest?.pageCount ?? preview.manifest?.pages?.length ?? 0,
)
const name = computed(() => props.filename || props.documentId)

// The preview base path: a whole document, or one inner file of a container (a
// multi-file bundle absorbs its originals, so an inner file has no id of its own —
// it is addressed by container id + inner name). Pages and the text layer hang off it.
const base = computed(() => {
  const id = encodeURIComponent(props.documentId)

  return props.innerName
    ? `/documents/${id}/data-objects/${encodeURIComponent(props.innerName)}/preview`
    : `/documents/${id}/preview`
})

// The current page image is fetched by index through the portal API — the same
// credentialed, same-origin channel as every other call — so the browser sends the
// session cookie automatically for this <img> request.
const pageSrc = computed(() => apiUrl(`${base.value}/pages/${page.value}`))

// The extracted text for the current page, exposed to screen readers alongside the
// inert image (best-effort — empty when the service extracted none).
const pageText = computed(() => preview.text[page.value] ?? '')

function go(delta: number): void {
  const next = page.value + delta
  if (next < 0 || next >= pageCount.value) return
  page.value = next
  imgLoading.value = true
  imgError.value = false
}

function onImgLoad(): void {
  imgLoading.value = false
}
function onImgError(): void {
  imgLoading.value = false
  imgError.value = true
}
function retry(): void {
  if (props.documentId) preview.load(base.value)
}

watch(
  base,
  (b) => {
    page.value = 0
    imgLoading.value = true
    imgError.value = false
    if (props.documentId) preview.load(b)
    else preview.reset()
  },
  { immediate: true },
)

onBeforeUnmount(() => preview.reset())
</script>

<template>
  <!-- Loading the manifest -->
  <div
    v-if="preview.state === 'loading' || preview.state === 'idle'"
    class="mt-4 grid place-items-center rounded-card border border-line bg-surface px-6 py-16 shadow-card"
    role="status"
    aria-live="polite"
  >
    <span class="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-green" aria-hidden="true" />
    <p class="mt-4 text-[13.5px] text-muted">{{ t('newSigning.review.preview.loading') }}</p>
  </div>

  <!-- Manifest failed: a safe message plus a retry and a download fallback -->
  <div
    v-else-if="preview.state === 'error'"
    class="mt-4 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card"
    role="alert"
  >
    <p class="text-[13.5px] text-muted">{{ t(preview.errorKey ?? 'errors.generic') }}</p>
    <div class="mt-4 flex justify-center gap-2">
      <Button variant="outline" size="sm" @click="retry">{{ t('newSigning.review.preview.retry') }}</Button>
      <Button variant="outline" size="sm" @click="emit('download')">{{ t('newSigning.review.download') }}</Button>
    </div>
  </div>

  <!-- Not previewable: a clean download-to-review, not an error -->
  <div
    v-else-if="preview.state === 'unsupported'"
    class="mt-4 rounded-card border border-line bg-surface px-6 py-10 shadow-card sm:px-11"
  >
    <p class="text-center font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
      {{ t('newSigning.review.previewEyebrow', { name }) }}
    </p>
    <div class="mt-8 flex flex-col items-center text-center">
      <span class="grid h-12 w-12 place-items-center rounded-card bg-band text-muted">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M14 3v5h5" stroke-linejoin="round" />
          <path d="M7 3h7l5 5v13H5V5a2 2 0 0 1 2-2z" stroke-linejoin="round" />
        </svg>
      </span>
      <p class="mt-4 max-w-sm text-[13.5px] text-muted">{{ t('newSigning.review.preview.unsupported') }}</p>
      <div class="mt-4">
        <Button variant="outline" size="sm" @click="emit('download')">{{ t('newSigning.review.download') }}</Button>
      </div>
    </div>
  </div>

  <!-- Ready: the inert page images, one page at a time -->
  <div v-else class="mt-4">
    <div class="rounded-card border border-line bg-surface px-4 py-6 shadow-card sm:px-8 sm:py-8">
      <p class="text-center font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
        {{ t('newSigning.review.preview.pageOf', { name, n: page + 1, total: pageCount }) }}
      </p>

      <div class="relative mt-5 min-h-[200px]">
        <div v-if="imgLoading && !imgError" class="absolute inset-0 grid place-items-center" aria-hidden="true">
          <span class="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-green" />
        </div>
        <p v-if="imgError" class="py-14 text-center text-[13.5px] text-muted">
          {{ t('newSigning.review.preview.pageError') }}
        </p>
        <img
          v-show="!imgError"
          :src="pageSrc"
          :alt="t('newSigning.review.preview.pageAlt', { name, n: page + 1, total: pageCount })"
          class="mx-auto h-auto max-w-full rounded-btn border border-line bg-paper transition-opacity"
          :class="imgLoading ? 'opacity-0' : 'opacity-100'"
          @load="onImgLoad"
          @error="onImgError"
        />
      </div>

      <!-- Screen-reader text layer for the current page (best-effort). -->
      <p v-if="pageText" class="sr-only">{{ pageText }}</p>

      <!-- Pager — only for multi-page documents. -->
      <div v-if="pageCount > 1" class="mt-6 flex items-center justify-center gap-4">
        <Button variant="outline" size="sm" :disabled="page === 0" @click="go(-1)">
          {{ t('newSigning.review.preview.prev') }}
        </Button>
        <span class="font-mono text-[12px] tabular-nums text-muted">{{ page + 1 }} / {{ pageCount }}</span>
        <Button variant="outline" size="sm" :disabled="page >= pageCount - 1" @click="go(1)">
          {{ t('newSigning.review.preview.next') }}
        </Button>
      </div>
    </div>

    <p class="mt-3 text-[13px] text-faint">
      {{ t('newSigning.review.preview.downloadHint') }}
      <button type="button" class="font-semibold text-green-deep" @click="emit('download')">
        {{ t('newSigning.review.download') }}
      </button>
    </p>
  </div>
</template>
