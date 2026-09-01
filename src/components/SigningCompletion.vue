<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import ValidatingCard from '@/components/ValidatingCard.vue'
import type { Validation } from '@/stores/signing'

// The post-approval completion experience (Authenticate → Complete), built to the
// design. Purely presentational: it shows progress and the outcome — it performs no
// signing or validation. The host (SigningView) drives `phase` from real backend state
// and owns the network mechanics; this component only renders one of four phases:
//   finalizing — sealing the QES; self-drawing signature → green seal
//   validating — EU DSS checking the seal; the completed signature under a scan line
//   passed     — Complete screen, TOTAL-PASSED verdict
//   pending    — Complete screen, validation didn't return in time (SUCCESS, not failure):
//                the signature is applied; only the report is late
// finalizing/validating use two independent SVG groups so a mid-draw flip snaps the
// signature to its completed state (settleIn) rather than continuing a partial stroke.
const props = defineProps<{
  phase: 'finalizing' | 'validating' | 'passed' | 'pending'
  method?: string
  validation: Validation | null
  canDownload: boolean
  // Where "Back" leads: the document's hub (a co-signer's slot), or the
  // documents home (a wizard self-sign — its envelope work is already done).
  backToHub: boolean
}>()

const emit = defineEmits<{ viewReport: []; retry: []; download: []; back: [] }>()
const { t } = useI18n()

const isFinalizing = computed(() => props.phase === 'finalizing')
const isValidating = computed(() => props.phase === 'validating')
const isWaiting = computed(() => isFinalizing.value || isValidating.value)
const isPassed = computed(() => props.phase === 'passed')
const isPending = computed(() => props.phase === 'pending')

// The signature stage caption + the status block copy switch with the waiting phase.
const stageCaption = computed(() =>
  isValidating.value ? t('signing.complete.validating.caption') : t('signing.complete.finalizing.caption'),
)
const waitingTitle = computed(() =>
  isValidating.value ? t('signing.complete.validating.title') : t('signing.complete.finalizing.title'),
)
const waitingBody = computed(() =>
  isValidating.value ? t('signing.complete.validating.body') : t('signing.complete.finalizing.body'),
)
const workingLabel = computed(() =>
  isValidating.value ? t('signing.complete.validating.working') : t('signing.complete.finalizing.working'),
)

// The Complete-screen subcopy. pending keeps the "signed & sealed" headline and only
// softens the subcopy to explain the late report.
const completeSub = computed(() =>
  isPending.value ? t('signing.complete.pendingSub') : t('signing.done.subtitle'),
)

// The result-card STATUS field. passed shows the real verdict the validation answer
// carried (green); pending shows VALIDATION PENDING (amber) — never colour alone, the
// dot + label carry the meaning too.
const statusValue = computed(() =>
  isPending.value ? t('signing.complete.statusPending') : (props.validation?.verdict ?? ''),
)

// The container's display name + form line. We surface only what the validation answer
// actually reported — no asserted facts. pending (no answer yet) shows just the headline.
const filename = computed(() => props.validation?.signedFiles?.[0] ?? t('signing.complete.container'))
const containerSub = computed(() => {
  const v = props.validation
  if (!v?.containerForm) return ''
  const n = v.signedFiles?.length ?? 0

  return n > 0 ? `${v.containerForm} · ${t('signing.complete.fileCount', { n }, n)}` : v.containerForm
})

// ISO signing time → "YYYY-MM-DD HH:mm" UTC (the design's compact form). The signing
// time is authoritative legal evidence, so it's shown in UTC (its source zone), not
// shifted to the viewer's local zone. Falls back to the raw value if it isn't parseable.
function formatSigned(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (x: number) => String(x).padStart(2, '0')

  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
const signedAt = computed(() => formatSigned(props.validation?.signingTime))

const backLabel = computed(() => (props.backToHub ? t('signing.done.backToDocument') : t('signing.done.again')))

// The two signature path `d` strings, ported verbatim from the design. The pen nib's
// offset-path reuses the main `d`, so it tracks the stroke exactly (set in scoped CSS).
const MAIN_PATH =
  'M 26 98 C 30 50 42 38 50 44 C 58 50 54 80 44 96 C 56 92 66 70 76 66 C 84 63 88 70 84 82 C 81 91 78 96 84 96 C 92 96 104 76 116 64 C 124 56 130 62 126 76 C 123 86 118 95 124 97 C 132 99 146 78 160 64 C 170 54 178 60 174 76 C 171 87 166 95 172 98 C 182 102 198 80 214 62 C 226 49 238 56 232 74 C 228 86 220 96 226 99 C 236 103 252 82 270 62'
const UNDER_PATH =
  'M 56 116 C 130 132 244 132 326 114 C 356 107 366 120 346 128 C 337 132 326 130 320 125'
</script>

<template>
  <!-- WAITING CARD (finalizing / validating) — no stepper of its own; the page stepper
       carries the 06 in-progress state. -->
  <div
    v-if="isWaiting"
    class="mx-auto w-[560px] max-w-full rounded-[16px] border border-line bg-surface p-[30px_36px] shadow-card"
    data-testid="waiting-card"
  >
    <!-- The shared validating element hosts both waiting phases; the finalizing
         self-draw loop rides in as slotted artwork (styled by this component's
         scope), the validating phase uses the element's own drawn signature + scan. -->
    <ValidatingCard
      :caption="stageCaption"
      :title="waitingTitle"
      :body="waitingBody"
      :label="workingLabel"
      :scan="isValidating"
    >
      <template #context>
        <span class="eyebrow tracking-[0.14em] text-faint">{{
          method ? t('signing.loaHigh', { method }) : t('signing.loaHighOnly')
        }}</span>
      </template>

      <template v-if="isFinalizing" #art>
        <g class="sig-group">
          <path
            :d="MAIN_PATH"
            class="draw-main"
            pathLength="1"
            fill="none"
            stroke="#0E9E6B"
            stroke-width="3.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray="1"
          />
          <path
            :d="UNDER_PATH"
            class="draw-under"
            pathLength="1"
            fill="none"
            stroke="#0E9E6B"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray="1"
          />
          <g class="pen-track">
            <circle r="9" fill="rgba(14,158,107,.16)" />
            <circle r="3.2" fill="#0E9E6B" />
          </g>
          <g transform="translate(372 84)" class="seal-pop">
            <circle r="17" fill="#0E9E6B" />
            <path d="M -7 0 L -2 6 L 8 -7" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        </g>
      </template>
    </ValidatingCard>
  </div>

  <!-- COMPLETE SCREEN (passed / pending). -->
  <div v-else class="flex w-full flex-col items-center text-center" role="status" aria-live="polite" data-testid="complete">
    <span class="mb-[22px] grid h-[74px] w-[74px] place-items-center rounded-pill bg-green-soft" aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0A7A52" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>

    <h1 class="mb-2.5 text-[34px] font-bold tracking-[-0.02em] text-ink">{{ t('signing.done.title') }}</h1>
    <p class="mb-7 max-w-[540px] text-[16.5px] leading-relaxed text-muted">{{ completeSub }}</p>

    <!-- Result card. -->
    <div class="w-[480px] max-w-full overflow-hidden rounded-[14px] border border-line bg-surface text-left shadow-card">
      <div class="flex items-center gap-3.5 px-6 py-5">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] bg-line-2" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7177" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </span>
        <div class="min-w-0">
          <div class="truncate text-base font-semibold text-ink">{{ filename }}</div>
          <div v-if="containerSub" class="mt-1 font-mono text-[12.5px] text-faint">{{ containerSub }}</div>
        </div>
      </div>
      <div class="border-t border-line-2" />
      <dl class="grid grid-cols-2 gap-[18px_24px] px-6 py-5">
        <div v-if="validation?.format">
          <dt class="eyebrow text-[10.5px] text-faint">{{ t('signing.field.format') }}</dt>
          <dd class="mt-1.5 font-mono text-[13.5px] text-ink">{{ validation.format }}</dd>
        </div>
        <div v-if="validation?.level">
          <dt class="eyebrow text-[10.5px] text-faint">{{ t('signing.field.level') }}</dt>
          <dd class="mt-1.5 font-mono text-[13.5px] text-ink">{{ validation.level }}</dd>
        </div>
        <div v-if="signedAt">
          <dt class="eyebrow text-[10.5px] text-faint">{{ t('signing.field.signingTime') }}</dt>
          <dd class="mt-1.5 font-mono text-[13.5px] text-ink">{{ signedAt }}</dd>
        </div>
        <div>
          <dt class="eyebrow text-[10.5px] text-faint">{{ t('signing.result.indication') }}</dt>
          <dd class="mt-1.5 inline-flex items-center gap-1.5">
            <span class="h-[7px] w-[7px] rounded-pill" :class="isPending ? 'bg-amber' : 'bg-green'" aria-hidden="true" />
            <span class="font-mono text-[13.5px] font-semibold" :class="isPending ? 'text-amber-fg' : 'text-green-deep'" data-testid="status-value">{{ statusValue }}</span>
          </dd>
        </div>
      </dl>
    </div>

    <!-- pending-only banner (informational, not an error). -->
    <div
      v-if="isPending"
      class="mt-4 flex w-[480px] max-w-full gap-3 rounded-[12px] border border-amber-line bg-amber-bg p-[14px_18px] text-left"
      role="status"
      data-testid="pending-banner"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A5E10" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="mt-px shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <div>
        <div class="mb-0.5 text-sm font-semibold text-amber-fg">{{ t('signing.complete.pendingBanner.title') }}</div>
        <div class="text-[13.5px] leading-relaxed text-amber-fg">{{ t('signing.complete.pendingBanner.body') }}</div>
      </div>
    </div>

    <!-- actions. -->
    <div class="mt-7 flex flex-col items-center gap-3.5">
      <Button v-if="isPassed && validation" @click="emit('viewReport')">{{ t('signing.done.viewReport') }}</Button>
      <Button v-else-if="isPending" @click="emit('retry')">{{ t('signing.complete.retry') }}</Button>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" :disabled="!canDownload" @click="emit('download')">{{ t('signing.done.download') }}</Button>
        <Button variant="ghost" @click="emit('back')">{{ backLabel }}</Button>
      </div>
      <span v-if="isPending" class="eyebrow tracking-[0.04em] text-faint">{{ t('signing.complete.pendingNote') }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Signature stage + animations, ported from the design. All finalize-loop elements
   share the 5.4s period so the draw, pen, underline and seal stay in sync. Vue scopes
   these @keyframes + their references together, so they never leak to other screens. */

/* finalizing — one loop = 5.4s, infinite. */
.sig-group {
  animation: sig-group 5.4s ease-in-out infinite;
}
.draw-main {
  animation:
    draw-main 5.4s linear infinite,
    sig-glow 5.4s ease-in-out infinite;
}
.draw-under {
  animation:
    draw-under 5.4s linear infinite,
    sig-glow 5.4s ease-in-out infinite;
}
.pen-track {
  offset-path: path(
    'M 26 98 C 30 50 42 38 50 44 C 58 50 54 80 44 96 C 56 92 66 70 76 66 C 84 63 88 70 84 82 C 81 91 78 96 84 96 C 92 96 104 76 116 64 C 124 56 130 62 126 76 C 123 86 118 95 124 97 C 132 99 146 78 160 64 C 170 54 178 60 174 76 C 171 87 166 95 172 98 C 182 102 198 80 214 62 C 226 49 238 56 232 74 C 228 86 220 96 226 99 C 236 103 252 82 270 62'
  );
  animation: pen-track 5.4s linear infinite;
}
.seal-pop {
  animation: seal-pop 5.4s ease-out infinite;
}

/* The validating stage, scan sweep, settle-in, dot and progress bar all live in
   the shared ValidatingCard now — only the finalizing self-draw is bespoke here. */

@keyframes sig-group {
  0% {
    opacity: 0;
  }
  3% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes draw-main {
  0%,
  4% {
    stroke-dashoffset: 1;
  }
  46%,
  100% {
    stroke-dashoffset: 0;
  }
}
@keyframes draw-under {
  0%,
  46% {
    stroke-dashoffset: 1;
  }
  60%,
  100% {
    stroke-dashoffset: 0;
  }
}
@keyframes seal-pop {
  0%,
  58% {
    opacity: 0;
  }
  70%,
  100% {
    opacity: 1;
  }
}
@keyframes sig-glow {
  0%,
  58%,
  100% {
    filter: drop-shadow(0 0 0 rgba(14, 158, 107, 0));
  }
  66% {
    filter: drop-shadow(0 0 5px rgba(14, 158, 107, 0.4));
  }
}
@keyframes pen-track {
  0% {
    opacity: 0;
    offset-distance: 0%;
  }
  4% {
    opacity: 1;
    offset-distance: 0%;
  }
  46% {
    opacity: 1;
    offset-distance: 100%;
  }
  52%,
  100% {
    opacity: 0;
    offset-distance: 100%;
  }
}
/* Honor reduced motion: drop the draw/pen/loop; show the finished signature and
   seal. Meaning is carried by the text + status (the shared card handles its own). */
@media (prefers-reduced-motion: reduce) {
  .sig-group,
  .draw-main,
  .draw-under,
  .seal-pop {
    animation: none;
  }
  .pen-track {
    animation: none;
    opacity: 0;
  }
  .draw-main,
  .draw-under {
    stroke-dashoffset: 0;
  }
}
</style>
