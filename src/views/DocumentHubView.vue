<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/AppShell.vue'
import { Button } from '@/components/ui/button'
import DocumentStatusPill from '@/components/DocumentStatusPill.vue'
import StatusPill from '@/components/StatusPill.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import ValidatingCard from '@/components/ValidatingCard.vue'
import AuditTrail, { type TrailEvent } from '@/components/AuditTrail.vue'
import ValidationReport from '@/components/ValidationReport.vue'
import type { ChainRow } from '@/stores/dashboard'
import { useDocumentsStore, type ValidationAnswer, type InnerFile } from '@/stores/documents'
import { useEnvelopesStore, type ComposedSlot } from '@/stores/envelopes'
import { useSessionStore } from '@/stores/session'
import {
  sortedSlots,
  turnSlotIds,
  signedCount,
  slotDisplay,
  toneFor,
  isFinished,
  othersSigningNow,
} from '@/lib/envelope-status'
import { ApiError } from '@/lib/api'

// The ONE document screen — a chain's home, reached from any dashboard row, the
// signer inbox, or a signing return. Its organizing rule: what you sign and who
// signs; everything else is metadata. The LEFT column is the document itself —
// the review-only preview (what you see is what you sign), the contextual
// actions beneath it (read to the end, the signing action waits there), and the
// activity trail folded to its latest event. The RIGHT column leads with WHO
// signs (the envelope's ordered signer list, when a signing workflow covers this
// chain), then the chain's facts, then a container's inner files — each
// previewable and downloadable on its own. A row click never signs and never
// downloads; every verb is an explicit action.
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const docs = useDocumentsStore()
const envelopes = useEnvelopesStore()
const session = useSessionStore()

const id = computed(() => String(route.params.id ?? ''))

// The chain comes from the chain endpoint — one read that carries the chain's
// own facts (signed-ness, preservation, retention, the download freeze) and what
// is inside the head container. A deep link is the same read, so a bookmarked
// URL renders the full screen rather than a reduced one.
const chain = ref<ChainRow | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')

// A container (a bundle, or an uploaded ASiC-E) is previewed per inner file — an
// inner file has no document id of its own, so it is addressed by (container id,
// inner name). A plain source / PDF keeps the by-document-id preview.
const isContainer = computed(() => chain.value?.kind === 'container')
const innerFiles = ref<InnerFile[]>([])
const activeInner = ref('')

// The signing workflow covering this chain, when one exists. Navigation may hand
// the envelope id over (?env=) to skip the lookup; a deep link resolves it from
// the covering-envelope lookup (owner or matched participant). No envelope →
// the standalone-chain shape (no signers card, no workflow trail).
const envelopeId = ref('')

onMounted(async () => {
  if (!(await loadChain())) return
  await resolveEnvelope()
  // Returned from the archive re-authentication (the router routed us back here
  // off the stash): the session holds a fresh certificate now — retry the
  // archive once, automatically. The stash is already cleared by the router.
  if (route.query.resumeArchive != null) {
    void router.replace({ query: { ...route.query, resumeArchive: undefined } })
    await addArchiveTimestamp()
  }
})

// Read the chain from its own endpoint — never from the dashboard listing. The
// listing answers a different question ("what should the library show?"): it
// subtracts a chain an envelope covers, and it pages. A screen that took its
// facts from there lost them the moment a workflow touched the document, and
// rendered a completed signing as an unsigned draft.
async function loadChain(): Promise<boolean> {
  try {
    chain.value = await docs.chain(id.value)
    innerFiles.value = chain.value.innerFiles ?? []
    if (!activeInner.value || !innerFiles.value.some((f) => f.name === activeInner.value)) {
      activeInner.value = innerFiles.value[0]?.name ?? ''
    }
    state.value = 'ready'

    return true
  } catch {
    state.value = 'error'

    return false
  }
}

// Resolve the covering envelope: the ?env= hint first, else the lookup keyed on
// the chain root (what an envelope attaches). Fail-soft — a miss just renders
// the standalone shape.
async function resolveEnvelope() {
  const hint = String(route.query.env ?? '')
  if (hint) {
    envelopeId.value = hint
  } else {
    try {
      const found = await envelopes.findForDocument(chain.value?.chainRootId || id.value)
      envelopeId.value = found[0]?.id ?? ''
    } catch {
      envelopeId.value = ''
    }
  }
  if (envelopeId.value) await envelopes.loadDetail(envelopeId.value)
}

const detail = computed(() => (envelopeId.value ? envelopes.detail : null))
const slots = computed(() => sortedSlots(detail.value))
const turnIds = computed(() => turnSlotIds(detail.value))
const mySlot = computed(() => slots.value.find((s) => s.you) ?? null)
const isViewerOwner = computed(() => Boolean(detail.value && detail.value.envelope.owner === session.identity?.sub))
const orderPolicy = computed(() => detail.value?.envelope.orderPolicy ?? 'parallel')
// The workflow is live: signatures are being collected right now.
const envActive = computed(() => /^(sent|in_progress)$/i.test(detail.value?.envelope.status ?? ''))
const envCompleted = computed(() => /completed/i.test(detail.value?.envelope.status ?? ''))
const mineIsTurn = computed(() => Boolean(mySlot.value && turnIds.value.has(mySlot.value.id)))
const mineFinished = computed(() => Boolean(mySlot.value && isFinished(mySlot.value)))
const concurrentSigning = computed(() => Boolean(mySlot.value && othersSigningNow(detail.value, mySlot.value.id)))
const canCancel = computed(() => isViewerOwner.value && envActive.value)

const title = computed(() => chain.value?.filename || id.value)
const mime = computed(() => chain.value?.mime ?? '')

// The format the Details card names: the document KIND in plain words — an
// ASiC-E container or a PDF — never a raw mime string.
const formatLabel = computed(() => {
  if (isContainer.value) return t('hub.kind.container')
  if (mime.value === 'application/pdf') return t('hub.kind.pdf')

  return mime.value
})
const subline = computed(() =>
  isContainer.value && innerFiles.value.length > 0
    ? `${t('hub.kind.container')} · ${t('hub.filesInside', { n: innerFiles.value.length }, innerFiles.value.length)}`
    : formatLabel.value,
)

// The workflow state: a chain is a draft until the first signature made here
// lands; a file uploaded already signed is still a draft (its signatures are a
// fact about the file, not the workflow).
const signedHere = computed(() => Boolean(chain.value?.platformSigned))
const preSigned = computed(() => Boolean(chain.value && chain.value.hasSignatures && !chain.value.platformSigned))
// Archived is a DURABLE chain fact: the archive timestamp upgrades the container
// to long-term preservation (B-LTA), recorded as preservation_class on the chain
// head. Sourced from the projection (not session state) so the trail row survives
// navigation exactly like "signed".
const isArchived = computed(() => chain.value?.preservationClass === 'preservation')

// The current chain HEAD id — what every document action (validate, archive,
// download) must target. The route id may be the chain ROOT (e.g. arriving via
// the sign-route redirect), but actions belong on the live head the projection
// shows; using the route id would act on a stale/root row. Falls back to the
// route id when the chain hasn't resolved (metadata-only deep link).
const headId = computed(() => chain.value?.id ?? id.value)
const expired = computed(() => {
  if (!chain.value) return false
  if (chain.value.status === 'expired') return true
  const until = Date.parse(chain.value.retentionUntil)
  return Number.isFinite(until) && until <= Date.now()
})

// The header pill: a live workflow states its progress; otherwise the chain's
// own lifecycle speaks.
const pillTone = computed(() => (envActive.value ? 'amber' : expired.value ? 'red' : signedHere.value ? 'green' : 'neutral'))
const pillLabel = computed(() => {
  if (envActive.value) {
    return t('envelopes.status.inProgress', { signed: signedCount(detail.value), total: slots.value.length })
  }

  return t(`documents.status.${expired.value ? 'expired' : signedHere.value ? 'completed' : 'draft'}`)
})

function formatDate(iso?: string): string {
  const ms = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(ms)) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(ms)
}

// A coarse "time left" for the retention horizon — hours under a day, then days.
const ttl = computed(() => {
  if (!chain.value) return ''
  if (expired.value) return t('documents.ttl.expired')
  const ms = Date.parse(chain.value.retentionUntil) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return t('documents.ttl.expired')
  const hours = Math.floor(ms / 3_600_000)
  return hours < 24
    ? t('documents.ttl.hours', { n: Math.max(1, hours) })
    : t('documents.ttl.days', { n: Math.floor(hours / 24) })
})

const sizeText = computed(() => {
  const n = chain.value?.size ?? 0
  if (n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
})

// --- Signers (the envelope's ordered list, verbatim from the tracking page) ---
function slotName(slot: ComposedSlot): string {
  if (mySlot.value && slot.id === mySlot.value.id) {
    return session.identity?.name || slot.signerName || t('envelopes.slot.you')
  }

  return slot.signerName || slot.identityRef || t('envelopes.slot.coSigner')
}
function isYou(slot: ComposedSlot): boolean {
  return Boolean(mySlot.value && slot.id === mySlot.value.id)
}
function slotTone(slot: ComposedSlot): 'green' | 'amber' | 'red' | 'neutral' {
  return toneFor(slotDisplay(slot, turnIds.value.has(slot.id), isYou(slot)))
}
function slotStatusLabel(slot: ComposedSlot): string {
  return t(`envelopes.slot.${slotDisplay(slot, turnIds.value.has(slot.id), isYou(slot))}`)
}

// Past 4 signers the list folds; the viewer's own slot and whose-turn stay
// pinned visible so the state that matters never hides behind the fold.
const SIGNERS_VISIBLE = 4
const signersExpanded = ref(false)
const signersFoldable = computed(() => slots.value.length > SIGNERS_VISIBLE)
const visibleSlots = computed(() => {
  if (!signersFoldable.value || signersExpanded.value) return slots.value
  const pinned = slots.value.filter((s) => isYou(s) || turnIds.value.has(s.id))
  const rest = slots.value.filter((s) => !pinned.includes(s))
  return [...pinned, ...rest].slice(0, Math.max(SIGNERS_VISIBLE, pinned.length))
})

// --- Contents (a container's inner files; the preview's navigation) ---
// Up to 2 files show in full; 3+ fold to the first 2 + "Show all" — and the file
// currently in the preview always stays visible (it swaps into the window).
const FILES_VISIBLE = 2
const filesExpanded = ref(false)
const filesFoldable = computed(() => innerFiles.value.length > FILES_VISIBLE)
const visibleFiles = computed(() => {
  if (!filesFoldable.value || filesExpanded.value) return innerFiles.value
  const window = innerFiles.value.slice(0, FILES_VISIBLE)
  const active = innerFiles.value.find((f) => f.name === activeInner.value)
  if (active && !window.includes(active)) window[FILES_VISIBLE - 1] = active
  return window
})
function fileSize(f: InnerFile): string {
  const n = f.size ?? 0
  if (n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function fileType(f: InnerFile): string {
  const ext = f.name.includes('.') ? (f.name.split('.').pop() ?? '') : ''
  if (ext && ext.length <= 5) return ext.toUpperCase()

  return (f.mediaType ?? '').split('/').pop()?.toUpperCase() ?? ''
}

// --- The one activity trail: document facts and workflow facts interleaved ---
// (uploaded → sent for signing → signed by NAME → all signatures applied →
// signed & sealed → validated → archived), folded to its latest event.
const trailExpanded = ref(false)
const trail = computed<TrailEvent[]>(() => {
  const events: TrailEvent[] = []
  if (chain.value) {
    events.push({
      key: 'uploaded',
      title: t('trail.uploaded'),
      sub: [title.value, formatDate(chain.value.chainCreatedAt)].filter(Boolean).join(' · '),
      tone: 'gray',
    })
    if (preSigned.value) {
      events.push({ key: 'pre-signed', title: t('trail.existingSignature'), tone: 'green' })
    }
  }
  const d = detail.value
  if (d) {
    if (!/^draft$/i.test(d.envelope.status)) {
      events.push({
        key: 'sent',
        title: t('trail.sent'),
        sub: [t(`envelopes.order.${orderPolicy.value}`), formatDate(d.envelope.createdAt)].filter(Boolean).join(' · '),
        tone: 'gray',
      })
    }
    const signedSlots = slots.value
      .filter((s) => s.status === 'signed' || /signed|completed/i.test(s.state ?? ''))
      .sort((a, b) => (a.signedAt ?? '').localeCompare(b.signedAt ?? ''))
    for (const s of signedSlots) {
      events.push({
        key: 'signed:' + s.id,
        title: t('trail.signedBy', { name: slotName(s) }),
        sub: formatDate(s.signedAt),
        tone: 'green',
      })
    }
    for (const s of slots.value.filter((sl) => sl.status === 'declined')) {
      events.push({ key: 'declined:' + s.id, title: t('trail.declinedBy', { name: slotName(s) }), tone: 'red' })
    }
    if (envCompleted.value) {
      events.push({ key: 'env-completed', title: t('trail.completed'), tone: 'seal' })
    } else if (/cancelled|declined/i.test(d.envelope.status)) {
      events.push({ key: 'env-cancelled', title: t('trail.cancelled'), tone: 'red' })
    } else if (envActive.value && turnIds.value.size > 0) {
      const waitingOn = slots.value
        .filter((s) => turnIds.value.has(s.id))
        .map((s) => slotName(s))
        .join(', ')
      events.push({ key: 'waiting', title: t('trail.waiting'), sub: waitingOn, tone: 'amber' })
    }
  }
  if (chain.value) {
    if (signedHere.value) {
      events.push({
        key: 'signed',
        title: t('trail.signed'),
        sub: formatDate(chain.value.createdAt),
        tone: 'seal',
      })
    }
    if (validation.value) {
      events.push({
        key: 'validated',
        title: t('trail.validated'),
        sub: [validation.value.verdict, validation.value.level].filter(Boolean).join(' · '),
        tone: validation.value.pass ? 'green' : 'red',
      })
    }
    if (isArchived.value) {
      events.push({ key: 'archived', title: t('trail.archived'), tone: 'green' })
    }
  }
  return events
})
const visibleTrail = computed(() =>
  trailExpanded.value || trail.value.length <= 1 ? trail.value : trail.value.slice(-1),
)

// --- Actions ---
const downloading = ref(false)
const deleteConfirm = ref(false)
const deleting = ref(false)
const declineConfirm = ref(false)
const declining = ref(false)
const cancelConfirm = ref(false)
const cancelling = ref(false)
const actionError = ref(false)
// When an action fails we keep the API error's stable code (to show a specific
// message instead of a blanket "something went wrong") and its trace id (a safe
// support reference the operator can look up in the logs).
const actionErrorCode = ref<string | null>(null)
const actionErrorRef = ref<string | null>(null)

function clearActionError() {
  actionError.value = false
  actionErrorCode.value = null
  actionErrorRef.value = null
}

function setActionError(e: unknown) {
  actionError.value = true
  actionErrorCode.value = e instanceof ApiError ? e.code : null
  actionErrorRef.value = e instanceof ApiError ? e.traceId : null
}

// A code-specific message where we have one, else the generic fallback. Keeps the
// user out of the dark when the provider gives a definitive, actionable reason.
const actionErrorMsg = computed(() => {
  switch (actionErrorCode.value) {
    case 'err:signing:invalidDocument':
      return t('envelopes.error.invalidDocument')
    default:
      return t('envelopes.error.action')
  }
})

const archiving = ref(false)
const validating = ref(false)
const validation = ref<ValidationAnswer | null>(null)
// The full validation report screen, opened from the inline verdict — the same
// rich report the signing flow lands on (and Verify reuses).
const showReport = ref(false)

// Validate-on-demand: the file's signatures checked right now, answer shown
// inline. A passing verdict on a pre-signed upload unlocks the archive
// timestamp (a chain signed here was already validated at signing). A repeat
// press within the render-recent window serves the held answer instantly;
// once an answer is shown the button becomes the explicit Re-validate, which
// forces a fresh round.
async function validateNow() {
  const force = !!validation.value
  validating.value = true
  clearActionError()
  try {
    validation.value = await docs.validate(headId.value, { force })
    // Land on the answer, not a chip: the full report opens the moment the
    // verdict is in (its Back returns here). Without this the result of a
    // 10+ second check is a line the user has to find.
    showReport.value = true
  } catch (e) {
    setActionError(e)
  } finally {
    validating.value = false
  }
}

const validationTone = computed(() => {
  if (!validation.value) return 'neutral'
  if (validation.value.pass) return 'green'
  return validation.value.verdict === 'FAILED' ? 'red' : 'amber'
})

// When the shown answer's validation actually ran — a render-recent answer is
// presented "as of" that moment, never as current.
const validatedAtLabel = computed(() => {
  const at = validation.value?.validatedAt
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at

  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
})

// The archive timestamp extends a signed chain's verifiability (B-LT → B-LTA).
// Live for a chain signed here (it was validated at signing); a pre-signed
// upload unlocks it once its on-demand validation passes.
async function addArchiveTimestamp() {
  archiving.value = true
  clearActionError()
  try {
    await docs.archiveTimestamp(headId.value)
    await refresh()
  } catch (e) {
    // The timestamp is requested in the user's name, and this session no longer
    // holds their certificate: go capture one — straight to the re-authentication
    // consent window, exactly like every redirect flow, and retry on return. No
    // interstitial; the pending archive rides session storage across the redirect.
    if (e instanceof ApiError && e.code === 'err:signing:authCertificateRequired') {
      if (await reauthForArchive()) return
    }
    setActionError(e)
  } finally {
    archiving.value = false
  }
}

// Start the same-method re-authentication that re-captures the session's signing
// capabilities, stashing the pending archive so the return retries it. False when
// the redirect could not start (the caller then shows the original error).
async function reauthForArchive(): Promise<boolean> {
  try {
    const url = await session.stepUp(session.identity?.loginMethod ?? '')
    if (!url) return false
    sessionStorage.setItem(pendingArchiveKey, JSON.stringify({ doc: id.value, at: Date.now() }))
    window.location.assign(url)

    return true
  } catch {
    return false
  }
}

// Where a pending archive waits out the re-authentication redirect. Holds only a
// document id and a timestamp — never a credential.
const pendingArchiveKey = 'signbyte.pendingArchive'

// Re-read the chain + the covering envelope after a workflow action changed
// either (a decline, a cancel, an applied archive timestamp).
async function refresh() {
  await loadChain()
  if (envelopeId.value) await envelopes.loadDetail(envelopeId.value)
}

// Both signing verbs enter the guided wizard at its Review step with this
// document staged — the ceremony always starts from the beginning (review
// before method), and adding co-signers is the same flow with recipients set.
function startSigning() {
  router.push({ name: 'sign-new', query: { doc: id.value } })
}

// The live workflow's own signing action: sign your slot (the ordering gate is
// enforced server-side; the button reflects it).
function reviewAndSign() {
  if (!mySlot.value || !envelopeId.value) return
  const doc = detail.value?.documents[0]?.documentId ?? id.value
  router.push({
    name: 'sign-slot',
    params: { id: envelopeId.value, slot: mySlot.value.id },
    query: { doc },
  })
}

async function doDecline() {
  if (!mySlot.value || !envelopeId.value) return
  declining.value = true
  clearActionError()
  try {
    await envelopes.declineSlot(envelopeId.value, mySlot.value.id)
    await refresh()
  } catch (e) {
    setActionError(e)
  } finally {
    declining.value = false
    declineConfirm.value = false
  }
}

async function doCancel() {
  if (!envelopeId.value) return
  cancelling.value = true
  clearActionError()
  try {
    await envelopes.cancel(envelopeId.value)
    await refresh()
  } catch (e) {
    setActionError(e)
  } finally {
    cancelling.value = false
    cancelConfirm.value = false
  }
}

async function download() {
  downloading.value = true
  clearActionError()
  try {
    await docs.download(headId.value)
  } catch (e) {
    setActionError(e)
  } finally {
    downloading.value = false
  }
}

// Download one inner original of a container — every inner file is retrievable
// on its own (a multi-file bundle absorbs its originals, so the container is
// their only home). Works during the workflow too: the freeze locks the signed
// result, never these originals.
async function downloadInnerFile(name: string) {
  // Destroyed storage has nothing to hand out — every affordance that reaches
  // here is hidden on an expired chain, and this guard keeps that true even if
  // a future one forgets.
  if (expired.value) return
  clearActionError()
  try {
    await docs.downloadInner(headId.value, name)
  } catch (e) {
    setActionError(e)
  }
}

async function doDelete() {
  deleting.value = true
  clearActionError()
  try {
    await docs.remove(id.value)
    router.push({ name: 'home' })
  } catch (e) {
    setActionError(e)
    deleting.value = false
    deleteConfirm.value = false
  }
}

function goToDashboard() {
  router.push({ name: 'home' })
}
</script>

<template>
  <AppShell>
    <!-- The full validation report (from the approved hub design): opened from
         the validate answer, back returns to the hub. -->
    <div v-if="showReport && validation" class="mx-auto max-w-4xl">
      <ValidationReport :validation="validation" :document-name="title" @back="showReport = false" />
    </div>

    <div v-else class="mx-auto max-w-4xl">
      <button
        type="button"
        class="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink"
        @click="goToDashboard"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ t('envelopes.backToDocuments') }}
      </button>

      <!-- Loading -->
      <div
        v-if="state === 'loading'"
        class="rounded-card border border-line bg-surface p-10 text-center text-sm text-muted shadow-card"
      >
        {{ t('hub.loading') }}
      </div>

      <!-- Error -->
      <div
        v-else-if="state === 'error'"
        class="rounded-card border border-line bg-surface p-10 text-center shadow-card"
        role="alert"
      >
        <p class="text-sm text-red-fg">{{ t('errors.generic') }}</p>
        <div class="mt-4">
          <Button variant="outline" size="sm" @click="goToDashboard">{{ t('envelopes.backToDocuments') }}</Button>
        </div>
      </div>

      <template v-else>
        <!-- Header -->
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-mono text-[11.5px] uppercase tracking-[0.12em] text-green-deep">
              {{ t('hub.eyebrow') }} · {{ pillLabel }}
            </p>
            <h1 class="mt-1 truncate text-2xl font-bold tracking-tight text-ink">{{ title }}</h1>
            <p v-if="subline" class="mt-1 text-sm text-muted">{{ subline }}</p>
          </div>
          <DocumentStatusPill :tone="pillTone" :label="pillLabel" />
        </div>

        <!-- Pre-signed upload note: the file already carries signatures -->
        <div
          v-if="preSigned && !envActive"
          class="mt-5 flex items-center gap-3 rounded-card border border-green-soft-line bg-green-soft p-3.5"
          role="status"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            class="shrink-0 text-green-deep" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" stroke-linecap="round" />
          </svg>
          <span class="text-[13.5px] text-green-deep">{{ t('hub.preSigned') }}</span>
        </div>

        <div class="mt-5 grid items-start gap-4 md:grid-cols-[3fr_2fr]">
          <!-- LEFT: the document — the preview hero, the actions beneath it (read
               to the end, the signing action waits there), then the folded trail. -->
          <div class="flex min-w-0 flex-col gap-4">
            <div class="relative rounded-card border border-line bg-surface p-5">
              <p class="truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                {{ t('hub.preview') }} · {{ isContainer && activeInner ? activeInner : title }}
              </p>

              <!-- Storage destroyed: the honest state instead of a preview that can
                   only fail — the record's home is History. -->
              <div
                v-if="expired"
                class="mt-3 grid min-h-[220px] place-items-center rounded-btn border border-line-2 bg-band p-6 text-center"
              >
                <div>
                  <p class="text-[13px] text-ink">{{ t('hub.expiredGone') }}</p>
                  <Button variant="outline" class="mt-3" @click="router.push({ name: 'history' })">
                    {{ t('hub.expiredGoneLink') }}
                  </Button>
                </div>
              </div>
              <DocumentPreview
                v-else-if="isContainer && activeInner"
                :key="activeInner"
                class="mt-3"
                :document-id="headId"
                :inner-name="activeInner"
                :filename="activeInner"
                @download="downloadInnerFile(activeInner)"
              />
              <DocumentPreview v-else class="mt-3" :document-id="id" :filename="title" @download="download" />

              <div
                v-if="validating"
                class="absolute inset-0 z-10 flex items-center justify-center rounded-card bg-paper/80 p-6 backdrop-blur-[3px]"
              >
                <div class="w-[440px] max-w-full rounded-[16px] border border-line bg-surface px-[26px] py-[22px] shadow-console">
                  <ValidatingCard
                    :context="title"
                    :caption="t('hub.validating.caption')"
                    :title="t('hub.validating.title')"
                    :body="t('hub.validating.body')"
                    :label="t('verify.working')"
                  />
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="rounded-card border border-line bg-surface p-5">
              <p class="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">{{ t('hub.actions') }}</p>
              <p v-if="isViewerOwner && detail" class="mt-2 text-[12.5px] text-faint">{{ t('envelopes.actions.ownerNote') }}</p>

              <p v-if="actionError" class="mt-3 text-[13px] text-red-fg" role="alert">
                {{ actionErrorMsg }}
                <span v-if="actionErrorRef" class="mt-1 block font-mono text-[12px] text-muted-2">{{
                  t('envelopes.error.reference', { id: actionErrorRef })
                }}</span>
              </p>

              <div class="mt-3 flex flex-col gap-2.5">
                <!-- The live workflow's signing action: your slot, gated by turn. -->
                <template v-if="envActive && mySlot && !mineFinished">
                  <p
                    v-if="concurrentSigning"
                    class="rounded-btn border border-amber-line bg-amber-bg px-3 py-2 text-[12.5px] text-amber-fg"
                    role="status"
                  >
                    {{ t('envelopes.concurrent.inProgress') }}
                  </p>
                  <template v-if="!declineConfirm">
                    <Button :disabled="!mineIsTurn || concurrentSigning" @click="reviewAndSign">
                      {{ t('envelopes.actions.sign') }}
                    </Button>
                    <Button variant="outline" @click="declineConfirm = true">{{ t('envelopes.actions.decline') }}</Button>
                  </template>
                  <div v-else class="rounded-btn border border-line-2 bg-band p-3">
                    <p class="text-[13px] text-ink">{{ t('envelopes.actions.declineConfirm') }}</p>
                    <div class="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" :disabled="declining" @click="doDecline">
                        {{ declining ? t('envelopes.actions.declining') : t('envelopes.actions.declineYes') }}
                      </Button>
                      <Button variant="ghost" size="sm" :disabled="declining" @click="declineConfirm = false">
                        {{ t('envelopes.actions.declineNo') }}
                      </Button>
                    </div>
                  </div>
                  <p v-if="!mineIsTurn && !declineConfirm" class="text-[12px] text-muted">
                    {{ t('envelopes.actions.notYourTurn') }}
                  </p>
                </template>

                <!-- Starting a signing only applies to a chain with no live workflow. -->
                <Button v-if="!signedHere && !expired && !envActive" @click="startSigning">{{ t('hub.act.sign') }}</Button>
                <Button v-if="!signedHere && !expired && !envActive" variant="outline" @click="startSigning">
                  {{ t('hub.act.addCoSigners') }}
                </Button>
                <!-- Byte-touching actions need the bytes: none are offered once
                     retention has destroyed the storage (every one would 410). -->
                <Button
                  v-if="(preSigned || signedHere) && !expired"
                  variant="outline"
                  :disabled="validating"
                  @click="validateNow"
                >
                  {{ validating ? t('hub.act.validating') : validation ? t('hub.act.revalidate') : t('hub.act.validate') }}
                </Button>
                <div
                  v-if="validation"
                  class="rounded-btn border px-3 py-2 text-[12.5px]"
                  :class="{
                    'border-green-soft-line bg-green-soft text-green-deep': validationTone === 'green',
                    'border-amber-line bg-amber-bg text-amber-fg': validationTone === 'amber',
                    'border-red-fg/30 bg-red-bg text-red-fg': validationTone === 'red',
                  }"
                  role="status"
                >
                  <span class="font-mono text-[11px] uppercase tracking-[0.08em]">{{ validation.verdict }}</span>
                  <span v-if="validation.level"> · {{ validation.level }}</span>
                  <span v-if="validation.format"> · {{ validation.format }}</span>
                  <span v-if="validatedAtLabel" class="mt-0.5 block text-[11px] opacity-75">
                    {{ t('signing.result.asOf', { time: validatedAtLabel }) }}
                  </span>
                </div>
                <Button v-if="validation" variant="outline" @click="showReport = true">
                  {{ t('hub.act.viewReport') }}
                </Button>
                <Button
                  v-if="(signedHere || preSigned) && !expired"
                  variant="outline"
                  :disabled="archiving || isArchived || (preSigned && !validation?.pass)"
                  @click="addArchiveTimestamp"
                >
                  {{ isArchived ? t('hub.act.archiveTsDone') : archiving ? t('hub.act.archiving') : t('hub.act.archiveTs') }}
                </Button>
                <p v-if="preSigned && !validation?.pass && !isArchived && !expired" class="text-[11.5px] text-faint">
                  {{ t('hub.archiveNeedsValidation') }}
                </p>
                <Button
                  v-if="!expired && !chain?.resultFrozen"
                  variant="outline"
                  :disabled="downloading"
                  @click="download"
                >
                  {{ signedHere ? t('hub.act.downloadSigned') : t('hub.act.downloadOriginal') }}
                </Button>
                <!-- The download is server-frozen while the signing workflow is in
                     progress; say so instead of offering a dead button. -->
                <p v-else-if="!expired" class="text-[11.5px] text-faint">
                  {{ t('hub.downloadFrozen') }}
                </p>

                <!-- Owner cancel of the live workflow. -->
                <div v-if="canCancel" class="mt-1 border-t border-line-2 pt-3">
                  <Button
                    v-if="!cancelConfirm"
                    variant="outline"
                    class="w-full border-red-fg/30 text-red-fg hover:bg-red-bg"
                    @click="cancelConfirm = true"
                  >
                    {{ t('envelopes.actions.cancel') }}
                  </Button>
                  <div v-else class="rounded-btn border border-line-2 bg-band p-3">
                    <p class="text-[13px] text-ink">{{ t('envelopes.actions.cancelConfirm') }}</p>
                    <div class="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" :disabled="cancelling" @click="doCancel">
                        {{ cancelling ? t('envelopes.actions.cancelling') : t('envelopes.actions.cancelYes') }}
                      </Button>
                      <Button variant="ghost" size="sm" :disabled="cancelling" @click="cancelConfirm = false">
                        {{ t('envelopes.actions.cancelNo') }}
                      </Button>
                    </div>
                  </div>
                </div>

                <div v-if="!envActive" class="mt-1 border-t border-line-2 pt-3">
                  <Button
                    v-if="!deleteConfirm"
                    variant="outline"
                    class="w-full border-red-fg/30 text-red-fg hover:bg-red-bg"
                    @click="deleteConfirm = true"
                  >
                    {{ t('hub.act.delete') }}
                  </Button>
                  <div v-else class="rounded-btn border border-line-2 bg-band p-3">
                    <p class="text-[13px] text-ink">{{ t('hub.deleteConfirm') }}</p>
                    <div class="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" :disabled="deleting" @click="doDelete">
                        {{ deleting ? t('hub.deleting') : t('hub.deleteYes') }}
                      </Button>
                      <Button variant="ghost" size="sm" :disabled="deleting" @click="deleteConfirm = false">
                        {{ t('hub.deleteNo') }}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- The one activity trail — folded to its latest event. -->
            <AuditTrail v-if="trail.length" :label="t('trail.label')" :events="visibleTrail">
              <template #actions>
                <button
                  v-if="trail.length > 1"
                  type="button"
                  class="rounded-btn border border-line bg-surface px-3 py-1 text-[12px] font-semibold text-ink hover:bg-band"
                  @click="trailExpanded = !trailExpanded"
                >
                  {{ trailExpanded ? t('hub.trailFold') : t('hub.trailShowAll') }}
                </button>
              </template>
            </AuditTrail>
          </div>

          <!-- RIGHT: WHO signs first, then the metadata (details, contents). -->
          <div class="flex min-w-0 flex-col gap-4">
            <!-- Signers — the envelope's ordered list, when a workflow covers this chain. -->
            <div v-if="detail && slots.length" class="rounded-card border border-line bg-surface p-5">
              <p class="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                {{ orderPolicy === 'parallel' ? t('envelopes.signersParallel') : t('envelopes.signers') }}
              </p>
              <ul class="mt-3">
                <li
                  v-for="(slot, i) in visibleSlots"
                  :key="slot.id"
                  class="relative flex items-center gap-3"
                  :class="i < visibleSlots.length - 1 ? 'pb-4' : ''"
                >
                  <span
                    v-if="i < visibleSlots.length - 1"
                    class="absolute bottom-0 left-4 top-8 w-0.5 -translate-x-1/2 bg-line-2"
                    aria-hidden="true"
                  />
                  <span
                    class="relative grid h-8 w-8 shrink-0 place-items-center rounded-pill text-[12px] font-semibold"
                    :class="isYou(slot) ? 'bg-green-soft text-green-deep' : 'bg-band text-muted'"
                    aria-hidden="true"
                  >
                    {{ slotName(slot).slice(0, 1).toUpperCase() }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-ink">{{ slotName(slot) }}</span>
                    <span class="block text-[12.5px] text-faint">
                      {{ isYou(slot) ? t('envelopes.slot.you') : t('envelopes.slot.coSigner') }}
                    </span>
                  </span>
                  <StatusPill :tone="slotTone(slot)" :label="slotStatusLabel(slot)" />
                </li>
              </ul>
              <Button
                v-if="signersFoldable"
                variant="outline"
                size="sm"
                class="mt-3 w-full"
                @click="signersExpanded = !signersExpanded"
              >
                {{ signersExpanded ? t('hub.showFewer') : t('hub.showAllSigners', { n: slots.length }) }}
              </Button>
            </div>

            <!-- Details -->
            <div class="rounded-card border border-line bg-surface p-5">
              <p class="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">{{ t('hub.details') }}</p>
              <dl class="mt-3 font-mono text-[12px] text-muted-2">
                <div class="flex justify-between gap-4">
                  <dt>{{ t('hub.field.file') }}</dt>
                  <dd class="truncate text-ink">{{ title }}</dd>
                </div>
                <div v-if="formatLabel" class="mt-1.5 flex justify-between gap-4">
                  <dt>{{ t('hub.field.format') }}</dt>
                  <dd class="text-ink">{{ formatLabel }}</dd>
                </div>
                <div v-if="chain" class="mt-1.5 flex justify-between gap-4">
                  <dt>{{ t('hub.field.signatures') }}</dt>
                  <dd class="text-ink">{{ chain.hasSignatures ? t('hub.field.signaturesYes') : t('hub.field.signaturesNo') }}</dd>
                </div>
                <div v-if="sizeText" class="mt-1.5 flex justify-between gap-4">
                  <dt>{{ t('hub.field.size') }}</dt>
                  <dd class="text-ink">{{ sizeText }}</dd>
                </div>
                <div v-if="chain && formatDate(chain.chainCreatedAt)" class="mt-1.5 flex justify-between gap-4">
                  <dt>{{ t('hub.field.uploaded') }}</dt>
                  <dd class="text-ink">{{ formatDate(chain.chainCreatedAt) }}</dd>
                </div>
                <div v-if="detail" class="mt-1.5 flex justify-between gap-4">
                  <dt>{{ t('envelopes.meta.order') }}</dt>
                  <dd class="text-ink">{{ t(`envelopes.order.${orderPolicy}`) }}</dd>
                </div>
                <div v-if="ttl" class="mt-2 flex justify-between gap-4 border-t border-line-2 pt-2">
                  <dt>{{ t('hub.field.autoDelete') }}</dt>
                  <dd class="text-ink">{{ ttl }}</dd>
                </div>
              </dl>
              <p v-if="chain" class="mt-3 text-[12px] text-muted">{{ t('hub.ttlNote') }}</p>
            </div>

            <!-- Contents — a container's inner files, each previewable + downloadable
                 on its own. Row click switches the preview; the icon downloads. The
                 names and sizes are record metadata and stay visible on an expired
                 chain; the download icon does not — the bytes are destroyed, and the
                 button could only answer "gone". -->
            <div v-if="isContainer && innerFiles.length" class="rounded-card border border-line bg-surface p-5">
              <p class="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                {{ t('hub.contents', { n: innerFiles.length }, innerFiles.length) }}
              </p>
              <ul class="mt-2">
                <li v-for="f in visibleFiles" :key="f.name">
                  <div
                    class="flex cursor-pointer items-center gap-2.5 rounded-btn px-2 py-2 hover:bg-band"
                    :class="activeInner === f.name ? 'bg-green-soft' : ''"
                    role="button"
                    tabindex="0"
                    :aria-current="activeInner === f.name"
                    @click="activeInner = f.name"
                    @keydown.enter="activeInner = f.name"
                  >
                    <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{{ f.name }}</span>
                    <span class="shrink-0 font-mono text-[11px] text-muted">
                      {{ [fileType(f), fileSize(f)].filter(Boolean).join(' · ') }}
                    </span>
                    <button
                      v-if="!expired"
                      type="button"
                      class="grid h-7 w-7 shrink-0 place-items-center rounded-btn border border-line bg-surface text-ink hover:bg-band"
                      :title="t('hub.downloadFile', { name: f.name })"
                      :aria-label="t('hub.downloadFile', { name: f.name })"
                      @click.stop="downloadInnerFile(f.name)"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>
                  </div>
                </li>
              </ul>
              <Button
                v-if="filesFoldable"
                variant="outline"
                size="sm"
                class="mt-2 w-full"
                @click="filesExpanded = !filesExpanded"
              >
                {{ filesExpanded ? t('hub.showFewer') : t('hub.showAllFiles', { n: innerFiles.length }) }}
              </Button>
            </div>
          </div>
        </div>

        <p class="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {{ t('hub.audit') }}
        </p>
      </template>
    </div>
  </AppShell>
</template>
