<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SignatureInfo } from '@/stores/signing'

// One signature within a validated document. A container can hold several (parallel
// co-signatures), so the report renders one card per signature. Presentation only —
// the normalized fields are rendered as received, never re-computed.
const props = defineProps<{ signature: SignatureInfo }>()
const { t } = useI18n()

// The serial / personal identity code is masked by default. Revealing it is a purely
// client-side toggle — no server round-trip and not an audited disclosure.
const serialRevealed = ref(false)

const verdictTone = computed<'passed' | 'failed' | 'indeterminate'>(() => {
  const v = props.signature.verdict ?? ''
  if (/INDETERMINATE/i.test(v)) return 'indeterminate'
  if (/PASSED/i.test(v)) return 'passed'

  return 'failed'
})

// An e-seal is made by a legal person (an organisation). eIDAS serial numbers carry a
// 3-letter semantics prefix: natural persons are PNO/PAS/IDC/TIN; legal persons are
// NTR/VAT/LEI/PSD. A legal-person identifier (e.g. an organisation registration
// number) is public — shown in full, never masked. Anything unrecognised falls through
// to the privacy-safe masked treatment.
const isOrgIdentifier = computed(() => /^(NTR|VAT|LEI|PSD)/i.test(props.signature.signerSerial ?? ''))

const warningCount = computed(() => props.signature.warnings?.length ?? 0)
const errorCount = computed(() => props.signature.errors?.length ?? 0)

// The salient issues as one verdict-tinted detail line (errors first, then warnings);
// empty arrays render nothing — no always-on "None" blocks.
const detailMessages = computed(() => [
  ...(props.signature.errors ?? []),
  ...(props.signature.warnings ?? []),
])
const hasDetail = computed(() => detailMessages.value.length > 0)
const detailIsError = computed(() => errorCount.value > 0)
const detailText = computed(() => detailMessages.value.join('; '))

const maskedSerial = computed(() => {
  const s = props.signature.signerSerial ?? ''
  if (!s) return ''

  return '•'.repeat(Math.min(s.length, 16))
})

// The signer's (or sealing organisation's) initials for the avatar; falls back to a
// neutral glyph.
const initials = computed(() => {
  const name = (props.signature.signer || props.signature.organization)?.trim()
  if (!name) return '—'

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
})

// Timestamps are rendered verbatim, exactly as the validation answer reported them
// (mono, seconds and zone intact) — never reformatted or re-computed client-side.
function formatTime(value?: string): string {
  return value ? value : '—'
}

function toggleSerial(): void {
  serialRevealed.value = !serialRevealed.value
}
</script>

<template>
  <div class="rounded-card border border-line bg-surface p-[22px] shadow-card">
    <div class="flex items-center gap-3 border-b border-line-2 pb-4">
      <span
        class="grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-semibold"
        :class="{
          'bg-green-soft text-green-deep': verdictTone === 'passed',
          'bg-red-bg text-red-fg': verdictTone === 'failed',
          'bg-amber-bg text-amber-fg': verdictTone === 'indeterminate',
        }"
        aria-hidden="true"
      >
        {{ initials }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold text-ink">
          {{ signature.signer || signature.organization || t('signing.result.role') }}
        </p>
        <p v-if="signature.signer && signature.organization" class="truncate text-sm text-muted">
          {{ signature.organization }}
        </p>
        <p v-else-if="signature.signer" class="truncate text-sm text-muted">{{ t('signing.result.role') }}</p>
      </div>
      <span
        class="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[12px] font-semibold"
        :class="{
          'bg-green-soft text-green-deep': verdictTone === 'passed',
          'bg-red-bg text-red-fg': verdictTone === 'failed',
          'bg-amber-bg text-amber-fg': verdictTone === 'indeterminate',
        }"
      >
        <svg v-if="verdictTone === 'passed'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
          <path d="M5 12.5l4 4 10-11" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else-if="verdictTone === 'failed'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" stroke-linecap="round" />
        </svg>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9.2 9a2.9 2.9 0 015.5 1c0 1.9-2.7 2.5-2.7 4.2M12 18h.01" stroke-linecap="round" />
        </svg>
        {{ t(`signing.verdict.${verdictTone}`) }}
      </span>
    </div>

    <dl class="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-7 gap-y-[15px] pt-5">
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{{ t('signing.result.indication') }}</dt>
        <dd class="font-mono text-[13px] text-ink">{{ signature.verdict }}</dd>
      </div>
      <div v-if="signature.format || signature.level">
        <dt class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{{ t('signing.result.formatLevel') }}</dt>
        <dd class="font-mono text-[13px] text-ink">
          {{ [signature.format, signature.level].filter(Boolean).join(' · ') }}
        </dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{{ t('signing.field.signingTime') }}</dt>
        <dd class="font-mono text-[13px] text-ink">{{ formatTime(signature.signingTime) }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{{ t('signing.result.revocation') }}</dt>
        <dd class="font-mono text-[13px] text-ink">{{ formatTime(signature.revocationTime) }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{{ t('signing.field.maxValidity') }}</dt>
        <dd class="font-mono text-[13px] text-ink">{{ formatTime(signature.maxValidityTime) }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{{ t('signing.result.warningsErrors') }}</dt>
        <dd class="font-mono text-[13px]" :class="errorCount > 0 ? 'text-red-fg' : 'text-ink'">
          {{ warningCount }} · {{ errorCount }}
        </dd>
      </div>
    </dl>

    <!-- One verdict-tinted detail line: the salient errors/warnings, only when present
         (no always-on empty blocks). The count above always shows the totals. -->
    <div
      v-if="hasDetail"
      class="mt-4 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-relaxed"
      :class="detailIsError ? 'border-red-bg bg-red-bg text-red-fg' : 'border-amber-line bg-amber-bg text-amber-fg'"
      data-testid="signature-detail"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="mt-px shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke-width="1.5" />
        <path d="M12 8v5m0 3h.01" stroke-width="1.9" stroke-linecap="round" />
      </svg>
      <span>{{ detailText }}</span>
    </div>

    <!-- Signer serial. A personal identity code is masked with a UI-only reveal; an
         organisation identifier (an e-seal's legal-person number) is public, so it is
         shown in full with no reveal and no "not recorded" note. -->
    <div
      v-if="signature.signerSerial"
      class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-2 bg-band px-4 py-3"
    >
      <div>
        <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          {{ isOrgIdentifier ? t('signing.result.orgId') : t('signing.result.pno') }}
        </p>
        <p
          class="font-mono text-[13px] tracking-wide"
          :class="isOrgIdentifier || serialRevealed ? 'text-ink' : 'text-faint'"
          data-testid="serial-value"
        >
          {{ isOrgIdentifier || serialRevealed ? signature.signerSerial : maskedSerial }}
        </p>
      </div>
      <button
        v-if="!isOrgIdentifier"
        type="button"
        class="inline-flex items-center gap-2 rounded-btn border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-band"
        :aria-pressed="serialRevealed"
        :aria-label="serialRevealed ? t('signing.field.hide') : t('signing.result.revealId')"
        @click="toggleSerial"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {{ serialRevealed ? t('signing.field.hide') : t('signing.result.revealId') }}
      </button>
    </div>
    <p v-if="signature.signerSerial && !isOrgIdentifier" class="mt-2 flex items-center gap-2 text-[12px] text-faint">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="flex-none" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {{ t('signing.result.revealNote') }}
    </p>
  </div>
</template>
