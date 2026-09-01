<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Validation, SignatureInfo } from '@/stores/signing'
import SignatureCard from '@/components/SignatureCard.vue'

// The full-page validation result. It is its own screen (not a modal): the signing
// flow lands here on completion, and the verify flow will reuse it. Presentation
// only — the normalized verdict is rendered as received, never re-computed in the
// browser. The header shows the document-level verdict; each signature the container
// holds is rendered as its own card (a parallel co-sign has several).
// `backLabel` lets the host name the back action for its own flow (the public
// verify screen reads "Validate next" — going back there means checking another
// document, not leaving).
const props = defineProps<{ validation: Validation; documentName?: string; backLabel?: string }>()
defineEmits<{ back: [] }>()
const { t, locale } = useI18n()

// Validation is time-anchored (revocation can post-date it): an answer served
// from the render-recent cache is presented "as of" the moment it ran, never
// as current.
const validatedAtLabel = computed(() => {
  const at = props.validation.validatedAt
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at

  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
})

const verdictTone = computed<'passed' | 'failed' | 'indeterminate'>(() => {
  const v = props.validation
  if (v.pass) return 'passed'
  if (/INDETERMINATE/i.test(v.verdict)) return 'indeterminate'

  return 'failed'
})

// Signed-file names are meaningful only for a multi-file container; a single PDF
// reports a placeholder upstream, which the answer already drops.
const isContainer = computed(() => props.validation.containerForm === 'ASiC-E')

// Render one card per signature. Older answers carry a single signer at the top level
// only; fall back to a synthetic single-signature list so they still render.
const signatures = computed<SignatureInfo[]>(() => {
  const v = props.validation
  if (v.signatures && v.signatures.length > 0) return v.signatures

  return [
    {
      verdict: v.verdict,
      format: v.format,
      level: v.level,
      signer: v.signer,
      signerSerial: v.signerSerial,
      organization: v.organization,
      signingTime: v.signingTime,
      revocationTime: v.revocationTime,
      maxValidityTime: v.maxValidityTime,
      warnings: v.warnings,
      errors: v.errors,
    },
  ]
})
</script>

<template>
  <div class="mx-auto max-w-[880px]">
    <button
      type="button"
      class="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink"
      @click="$emit('back')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ backLabel || t('common.back') }}
    </button>

    <h1 class="sr-only">{{ t('signing.result.title') }}</h1>

    <!-- Verdict header (dark console panel) — the document-level verdict. -->
    <section
      class="rounded-[16px] bg-console p-7 text-console-text"
      role="status"
      aria-live="polite"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p v-if="documentName" class="mb-2.5 font-mono text-[12.5px] text-console-muted">{{ documentName }}</p>
          <div class="flex items-center gap-3">
            <span
              class="grid h-11 w-11 place-items-center rounded-[11px]"
              :class="{
                'bg-green-bright/15': verdictTone === 'passed',
                'bg-red/20': verdictTone === 'failed',
                'bg-indeterminate/20': verdictTone === 'indeterminate',
              }"
              aria-hidden="true"
            >
              <svg v-if="verdictTone === 'passed'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2bd18c" stroke-width="2.4">
                <path d="M5 12.5l4 4 10-11" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else-if="verdictTone === 'failed'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff8580" stroke-width="2.4">
                <path d="M7 7l10 10M17 7L7 17" stroke-linecap="round" />
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0c24b" stroke-width="2">
                <path d="M9.2 9a2.9 2.9 0 015.5 1c0 1.9-2.7 2.5-2.7 4.2M12 18h.01" stroke-linecap="round" />
              </svg>
            </span>
            <div>
              <p
                class="font-mono text-[22px] font-bold tracking-[0.02em]"
                :class="{
                  'text-green-bright': verdictTone === 'passed',
                  'text-red': verdictTone === 'failed',
                  'text-indeterminate': verdictTone === 'indeterminate',
                }"
                data-testid="verdict-code"
              >
                {{ validation.verdict }}
              </p>
              <p class="text-sm text-console-muted">{{ t(`signing.result.sub.${verdictTone}`) }}</p>
              <p v-if="validatedAtLabel" class="mt-0.5 font-mono text-[11.5px] text-console-muted">
                {{ t('signing.result.asOf', { time: validatedAtLabel }) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Download report + Evidence package: rendered per the design but disabled
             ("available soon") — deferred pending a defined product need. -->
        <div class="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled
            :title="t('signing.result.availableSoon')"
            class="cursor-not-allowed rounded-[9px] bg-white/[0.08] px-[15px] py-2.5 text-[13.5px] font-semibold text-console-text opacity-50"
          >
            {{ t('signing.result.downloadReport') }}
          </button>
          <button
            type="button"
            disabled
            :title="t('signing.result.availableSoon')"
            class="cursor-not-allowed rounded-[9px] bg-green-bright px-[15px] py-2.5 text-[13.5px] font-semibold text-[#0a2a1c] opacity-50"
          >
            {{ t('signing.result.evidencePackage') }}
          </button>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-2 gap-5 border-t border-console-line pt-4 font-mono sm:grid-cols-3">
        <div>
          <p class="text-[10px] uppercase tracking-[0.08em] text-console-muted">{{ t('signing.field.containerForm') }}</p>
          <p class="text-[13px] text-console-text">{{ validation.containerForm ?? '—' }}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-[0.08em] text-console-muted">{{ t('signing.result.policy') }}</p>
          <p class="text-[13px] text-console-text">{{ t('signing.result.policyValue') }}</p>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-[0.08em] text-console-muted">{{ t('signing.result.service') }}</p>
          <p class="text-[13px] text-console-text">{{ t('signing.result.serviceValue') }}</p>
        </div>
      </div>

      <div v-if="isContainer" class="mt-4">
        <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-console-muted">{{ t('signing.result.includedFiles') }}</p>
        <div v-if="(validation.signedFiles?.length ?? 0) > 0" class="mt-2 flex flex-wrap gap-2">
          <span
            v-for="(f, i) in validation.signedFiles"
            :key="i"
            class="inline-flex items-center gap-2 rounded-chip border border-console-line bg-console-raised px-3 py-1.5 font-mono text-[12px] text-console-text"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <path d="M6 2h8l4 4v16H6V2z" stroke-linejoin="round" />
            </svg>
            {{ f }}
          </span>
        </div>
        <p v-else class="mt-1 text-[13px] text-console-muted">{{ t('signing.field.none') }}</p>
      </div>
    </section>

    <!-- Signatures — one card per signature the container holds. -->
    <p class="mx-1 mb-3 mt-6 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
      {{ t('signing.result.signatures') }}
    </p>

    <div class="space-y-4">
      <SignatureCard v-for="(s, i) in signatures" :key="i" :signature="s" />
    </div>

    <!-- What this means -->
    <div
      class="mt-5 rounded-card border p-5"
      :class="{
        'border-green-soft-line bg-green-soft': verdictTone === 'passed',
        'border-red-bg bg-red-bg': verdictTone === 'failed',
        'border-amber-line bg-amber-bg': verdictTone === 'indeterminate',
      }"
    >
      <p
        class="mb-2 font-mono text-[10.5px] uppercase tracking-[0.1em]"
        :class="{
          'text-green-deep': verdictTone === 'passed',
          'text-red-fg': verdictTone === 'failed',
          'text-amber-fg': verdictTone === 'indeterminate',
        }"
      >
        {{ t('signing.result.meansLabel') }}
      </p>
      <p
        class="text-sm leading-relaxed"
        :class="{
          'text-green-deep': verdictTone === 'passed',
          'text-red-fg': verdictTone === 'failed',
          'text-amber-fg': verdictTone === 'indeterminate',
        }"
      >
        {{ t(`signing.result.means.${verdictTone}`) }}
      </p>
    </div>

    <p class="mt-4 flex items-center gap-2 font-mono text-[12.5px] text-faint">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5m0 3h.01" stroke-linecap="round" />
      </svg>
      {{ t('signing.result.auditNote') }}
    </p>
  </div>
</template>
