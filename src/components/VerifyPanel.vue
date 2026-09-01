<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ValidationReport from '@/components/ValidationReport.vue'
import ValidatingCard from '@/components/ValidatingCard.vue'
import { api, ApiError } from '@/lib/api'
import type { Validation } from '@/stores/signing'

// The public verify flow: drop a signed document, get the full validation
// report. The file goes straight to the verify endpoint and is never stored —
// no document is created, so this panel owns its own dropzone rather than the
// wizard's staging one. Works identically with or without a session (the
// endpoint is public), so the view can host it in either presentation.
const { t } = useI18n()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const verifying = ref(false)
// '' = no error; otherwise a suffix under verify.err.* mapped from the API's
// typed rejection.
const errorKey = ref('')
const validation = ref<Validation | null>(null)
const fileName = ref('')

// Maps a verify failure to a stable i18n key — never the raw body. The codes
// are the platform's typed verify-gate rejections.
function verifyFailureKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'err:verify:notSigned') return 'notSigned'
    if (err.code === 'err:verify:unsupportedType') return 'unsupportedType'
    if (err.code === 'err:verify:malformed') return 'malformed'
    if (err.code === 'err:verify:fileTooLarge' || err.status === 413) return 'tooLarge'
    if (err.code === 'err:verify:tooManyRequests' || err.status === 429) return 'rateLimited'
    if (err.status === 502 || err.status === 503) return 'upstream'
  }
  return 'generic'
}

// The checking card holds at least this long, so a fast answer never flashes.
const MIN_DWELL_MS = 800

async function verifyFiles(files: FileList | null) {
  if (!files || files.length === 0 || verifying.value) return
  const file = files[0]
  verifying.value = true
  errorKey.value = ''
  fileName.value = file.name
  // One request, one visual loop: the animation repeats while this await is
  // pending — the network never re-polls.
  const dwell = new Promise((resolve) => setTimeout(resolve, MIN_DWELL_MS))
  try {
    const form = new FormData()
    form.append('file', file)
    const result = await api.postForm<Validation>('/verify', form)
    await dwell
    validation.value = result
  } catch (e) {
    await dwell
    errorKey.value = verifyFailureKey(e)
  } finally {
    verifying.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  verifyFiles(e.dataTransfer?.files ?? null)
}

// "Verify another": back to the dropzone, everything cleared.
function reset() {
  validation.value = null
  fileName.value = ''
  errorKey.value = ''
}
</script>

<template>
  <!-- The result: the same full validation report screen the signing flow lands on. -->
  <div v-if="validation">
    <ValidationReport
      :validation="validation"
      :document-name="fileName"
      :back-label="t('verify.validateNext')"
      @back="reset"
    />
    <div class="mx-auto mt-4 max-w-3xl">
      <button
        type="button"
        class="text-[13px] text-faint transition-colors hover:text-ink"
        @click="reset"
      >
        {{ t('verify.another') }}
      </button>
    </div>
  </div>

  <!-- Checking: the document under a scan line while the validation runs, on the
       page's own light surface (it replaces the dropzone in place). Neutral on
       purpose — the verdict is open here (pass, fail, indeterminate), so no
       success cue appears before the report. -->
  <section v-else-if="verifying" class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold tracking-tight text-ink">{{ t('verify.heading') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('verify.sub') }}</p>

    <!-- The signing completion's waiting card, with the shared validating element
         inside. -->
    <div class="mx-auto mt-6 w-[560px] max-w-full rounded-[16px] border border-line bg-surface p-[30px_36px] shadow-card">
      <ValidatingCard
        :context="fileName"
        :caption="t('verify.checkingStage')"
        :title="t('verify.checking')"
        :body="t('verify.checkingHint')"
        :label="t('verify.working')"
      />
    </div>
  </section>

  <!-- The dropzone. -->
  <section v-else class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold tracking-tight text-ink">{{ t('verify.heading') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('verify.sub') }}</p>

    <div
      role="button"
      tabindex="0"
      class="mt-6 cursor-pointer rounded-card border-2 border-dashed px-6 py-11 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
      :class="dragOver ? 'border-green bg-green-soft' : 'border-line bg-surface hover:bg-band'"
      @click="fileInput?.click()"
      @keydown.enter.prevent="fileInput?.click()"
      @keydown.space.prevent="fileInput?.click()"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="mx-auto mb-3" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="#0A7A52" stroke-width="1.7" stroke-linejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="#0A7A52" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <p class="text-base font-semibold text-ink">{{ t('verify.dropTitle') }}</p>
      <p class="mt-1 text-[13.5px] text-muted">{{ t('verify.dropHint') }}</p>
      <input
        ref="fileInput"
        type="file"
        class="sr-only"
        accept=".pdf,.asice,.edoc,.sce"
        :aria-label="t('verify.browse')"
        @change="verifyFiles(($event.target as HTMLInputElement).files)"
      />
    </div>
    <p v-if="errorKey" class="mt-3 text-sm text-red-fg" role="alert">
      {{ t('verify.err.' + errorKey) }}
    </p>
  </section>
</template>
