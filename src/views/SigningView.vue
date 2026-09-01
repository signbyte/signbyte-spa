<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/AppShell.vue'
import { Button } from '@/components/ui/button'
import SigningStepper from '@/components/SigningStepper.vue'
import SigningCompletion from '@/components/SigningCompletion.vue'
import ExtensionMissingCard from '@/components/ExtensionMissingCard.vue'
import ValidationReport from '@/components/ValidationReport.vue'
import { useSessionStore } from '@/stores/session'
import { useSigningStore, type BeginInput, type Job, type SigningPhase } from '@/stores/signing'
import { useDocumentsStore } from '@/stores/documents'
import { readSigningCertificate, signDigest, hashFnForDigest, isExtensionMissing } from '@/lib/webeid'
import { deriveSigFormat } from '@/lib/sigFormat'

// Post-approval completion mechanics (the completion screen). finalizing long-polls
// signflow through the BFF so it answers the moment the seal lands rather than tight-
// looping; validating fetches the EU DSS answer a bounded few times, then falls to the
// "pending" Complete variant (success — the signature is applied, the report is just
// late). Each waiting phase holds a minimum dwell so a fast result never flashes.
const FINALIZE_WAIT_S = 5 // long-poll window the BFF holds the status call open for
const FINALIZE_POLL_GAP_MS = 1000 // gap between long-polls (a floor if wait returns fast)
const FINALIZE_MAX_ATTEMPTS = 20 // ~2min ceiling before giving up on the seal
const CONFIRM_MAX_TURNS = 30 // confirm-in-app hang backstop (~3min > the provider's own deadline)
const CONFIRM_SEAL_DWELL_MS = 2500 // visible sealing beat when the confirm window collapses straight to COMPLETED
const VALIDATION_ATTEMPTS = 3 // bounded validation tries for a single signing
const VALIDATION_RETRY_MS = 5000 // gap between validation tries
const MIN_DWELL_MS = 800 // minimum visible time per waiting phase (one beat)

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const session = useSessionStore()
const signing = useSigningStore()
const docs = useDocumentsStore()

// This screen signs one envelope slot (/envelopes/:id/slots/:slot/sign — the
// document to sign rides in ?doc=). Every signing is an envelope slot: a
// self-sign arrives from the wizard as the single slot of its own envelope
// (?origin=new — the stepper keeps the full six-step flow and "Back" returns to
// the documents home), a co-sign arrives from the envelope's tracking page.
const slotId = computed(() => String(route.params.slot ?? ''))
const envelopeId = computed(() => String(route.params.id ?? ''))
const documentId = computed(() => String(route.query.doc ?? ''))

// A wizard-originated self-sign continues the six-step wizard presentation. The
// origin also survives a redirect-provider round trip (the provider's return URL
// carries only the job id) via the session-scoped marker the wizard set.
const fromWizard = computed(
  () =>
    route.query.origin === 'new' ||
    sessionStorage.getItem(`wizard-origin:${envelopeId.value}`) === '1',
)

// A PDF's format was chosen on the upload step (the "wrap in an ASiC-E
// container" toggle, carried here as this query flag); every other entry point
// (an existing draft, a co-signer's slot) has no such choice to carry, so it
// falls to the format-derive default.
const wrapInContainer = route.query.container === '1'

// The document's mime decides PAdES vs XAdES for a PDF; every other type is
// always XAdES. A lookup failure is not fatal — XAdES is the always-safe
// fallback (hash-only, works for any type) and the signer request itself will
// surface a clearer error if something is actually wrong with the document.
async function resolveSigFormat(): Promise<string> {
  try {
    const meta = await docs.get(documentId.value)

    return deriveSigFormat(meta.mime, wrapInContainer)
  } catch {
    return 'XAdES'
  }
}
const flowEseal = 'eparakstsMobileEseal'
// The login method dictates which signing flows are allowed; offer only those.
// Seal availability additionally gates the e-seal method: a login that VERIFIABLY
// found no seals hides it (a consent for a seal the user cannot have is a dead
// end); unknown availability keeps it — the signing flow resolves it, as it
// always did before capture existed.
const flows = computed(() => {
  const permitted = session.permittedFlows
  if (session.identity?.canEseal === false) {
    return permitted.filter((f) => f !== flowEseal)
  }

  return permitted
})
// The user's seals (id + display name), captured at login. With several, the
// e-seal card unfolds a picker; with exactly one, the card names it and no
// pick is needed (the platform resolves the single seal itself).
const seals = computed(() => session.identity?.seals ?? [])
const selectedSealId = ref('')
const sealPickerOpen = computed(() => selectedFlow.value === flowEseal && seals.value.length >= 2)
// Continue needs a method — and, when the picker is open, a picked seal.
const continueBlocked = computed(() => !selectedFlow.value || (sealPickerOpen.value && !selectedSealId.value))
// The method the user has picked in the card grid (pre-set to the first permitted one).
const selectedFlow = ref('')

// Begin the job through the slot trigger — it enforces the ordering gate and
// records the job on the slot.
function beginJob(input: BeginInput): Promise<Job> {
  return signing.beginSlot(envelopeId.value, slotId.value, input)
}
// The validation result is its own full-page screen (the design's "Validation
// report", shared with verify), not a modal — completion shows a confirmation that
// opens it.
const showReport = ref(false)

// A redirect-flow return lands here with ?job=<id> (the provider substituted it
// into the return URL the BFF supplied), and ?error=1 if the user declined or the
// authorization failed. Show an in-progress state at once so the picker never
// flashes, then resume polling that job to completion.
const resumeJobId = String(route.query.job ?? '')
const returnedWithError = route.query.error != null
if (resumeJobId && !returnedWithError) {
  signing.markResuming()
}

onMounted(() => {
  if (resumeJobId) {
    if (returnedWithError) {
      // The user cancelled at the provider (or it failed): release this attempt's chain
      // lock so a waiting co-signer is unblocked at once, then leave the signing flow —
      // back to the documents home (a wizard self-sign) or the envelope's tracking
      // page, rather than lingering on a signing-view retry state. replace() so Back
      // doesn't re-enter the errored return URL.
      void signing.abandon(resumeJobId)
      router.replace(
        fromWizard.value
          ? { name: 'documents' }
          : { name: 'document-hub', params: { id: documentId.value }, query: { env: envelopeId.value } },
      )

      return
    }
    void pollToDone(resumeJobId)

    return
  }
  signing.reset()
  // Pre-select the first permitted method so the card grid leads with a choice and
  // Continue is actionable; the user can pick another.
  selectedFlow.value = flows.value[0] ?? ''
  // 1 login = 1 sign method: when the login permits exactly one flow, skip the picker
  // and start it directly (the user already chose to sign this document). A failure
  // drops back to the card grid, where that one method stays pre-selected. Exception:
  // the e-seal method with several seals still needs the seal pick — stay on the grid.
  if (flows.value.length === 1 && !(flows.value[0] === flowEseal && seals.value.length >= 2)) {
    void sign(flows.value[0])
  }
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sign(flow: string): Promise<void> {
  return flow === 'webEid' ? signWithCard() : signWithRedirect(flow)
}

// The in-browser (Web eID card) flow: read the two card certificates, begin the
// job, sign each returned digest on the card (PIN 2), submit, then poll to done.
async function signWithCard(): Promise<void> {
  let signingCertificate: string
  try {
    signing.markReadingCard()
    // Read only the signing certificate — a PIN-less card read. The authentication
    // certificate is reused from the card login (held server-side by the BFF), so
    // there is no second card authentication: the only card PIN is the signature.
    signingCertificate = await readSigningCertificate(locale.value)
  } catch (err) {
    signing.fail(isExtensionMissing(err) ? 'signing.error.cardMissing' : 'signing.error.card')

    return
  }

  try {
    const job = await beginJob({
      documentId: documentId.value,
      flow: 'webEid',
      sigFormat: await resolveSigFormat(),
      signingCertificate,
    })

    const digests = job.documents ?? []
    if (digests.length === 0) {
      signing.fail('signing.error.noDigest')

      return
    }

    signing.markAwaitingCard()
    const signatures = []
    for (const d of digests) {
      const hashFn = hashFnForDigest(d.digest, d.digestAlgorithm)
      const signatureValue = await signDigest(signingCertificate, d.digest, hashFn, locale.value)
      signatures.push({ documentId: d.documentId, signatureValue })
    }

    await signing.submitClientSignature(job.jobId, signatures)
    await pollToDone(job.jobId)
  } catch (err) {
    // begin/submit/poll already set a safe failed state; only a card-side throw
    // (web-eid.sign) needs mapping here.
    if (signing.phase !== 'failed') {
      signing.fail(isExtensionMissing(err) ? 'signing.error.cardMissing' : 'signing.error.card')
    }
  }
}

// A redirect flow: begin the job, then hand the browser to the provider to
// authorize. The provider returns the browser to this screen (the BFF supplies the
// return URL carrying the job id), where the resume path above polls to completion;
// the QTSP code is never handled here.
async function signWithRedirect(flow: string): Promise<void> {
  try {
    const input: BeginInput = {
      documentId: documentId.value,
      flow,
      sigFormat: await resolveSigFormat(),
    }
    // The picked seal (several seals only — a single seal resolves itself).
    if (flow === flowEseal && selectedSealId.value) {
      input.sealId = selectedSealId.value
    }
    const job = await beginJob(input)
    if (job.authorizeUrl) {
      signing.markRedirecting()
      window.location.assign(job.authorizeUrl)

      return
    }
    signing.fail('signing.error.generic')
  } catch {
    /* begin already set the failed state */
  }
}

async function ensureDwell(start: number, min: number): Promise<void> {
  const elapsed = Date.now() - start
  if (elapsed < min) await delay(min - elapsed)
}

// Stops the pollToDone loop when the user leaves the screen (navigating away, or
// cancelling out of the confirm-in-app window) — a torn-down view must not keep
// long-polling a job it no longer renders.
let pollStopped = false

// Drive the job to completion. A device-push flow (eID Scan) first sits in the
// confirm-in-app window: the job stays SIGNING with a published verification code
// until the user confirms on their phone — the control-code card (authenticate
// step) renders instead of the completion screen, and those turns don't consume
// the finalize budget (the provider's own signing deadline bounds the window; its
// expiry fails the job server-side, and CONFIRM_MAX_TURNS only backstops a hang).
// Then the post-approval completion screen: finalizing (long-poll the seal to
// COMPLETED) → validating (bounded validation) → passed | pending. The store already
// records a safe failed state on a poll error (e.g. the keep-latest 409), so a thrown
// poll just stops the sequence — the failed panel takes over.
async function pollToDone(jobId: string): Promise<void> {
  signing.markFinalizing()
  let start = Date.now()
  let job: Job | null = null
  let attempts = 0
  let confirmTurns = 0
  // The first poll skips the long-poll wait: on a redirect return the job may
  // already be sitting in the confirm-in-app window, and the control-code card
  // must appear immediately — not after the first wait window drains.
  let wait = 0
  while (attempts < FINALIZE_MAX_ATTEMPTS && confirmTurns < CONFIRM_MAX_TURNS) {
    try {
      job = await signing.poll(jobId, wait)
    } catch {
      return
    }
    wait = FINALIZE_WAIT_S
    if (pollStopped) return
    if (job.state === 'COMPLETED') break
    if (job.state === 'FAILED') {
      signing.fail('signing.error.failed')

      return
    }
    if (job.state === 'SIGNING' && job.verificationCode) {
      signing.markConfirmInApp()
      confirmTurns++
    } else {
      // Confirmed on the phone — back onto the sealing track (restart the dwell
      // beat so the completion card gets its moment instead of flashing past).
      if (signing.phase === 'confirm-in-app') {
        signing.markFinalizing()
        start = Date.now()
      }
      attempts++
    }
    await delay(FINALIZE_POLL_GAP_MS)
  }
  if (!job || job.state !== 'COMPLETED') {
    signing.fail('signing.error.timeout')

    return
  }
  // A COMPLETED break can arrive straight out of the confirm window: the whole
  // server-side seal ran inside that last status turn, so the sealing animation
  // never had a live window of its own — give it a real beat instead of flashing
  // past to validation.
  const fromConfirm = signing.phase === 'confirm-in-app'
  signing.markFinalizing()
  if (fromConfirm) start = Date.now()
  await ensureDwell(start, fromConfirm ? CONFIRM_SEAL_DWELL_MS : MIN_DWELL_MS)

  // The seal is applied. If there's a signature to validate, run the bounded validation;
  // otherwise the document is signed but unvalidatable here → the pending Complete state.
  if (!job.signatureId) {
    signing.markPending()

    return
  }
  await runValidation(job.signatureId)
}

// Fetch the EU DSS validation answer a bounded few times. A returned answer → passed;
// exhausting the budget → pending (the signature stands; the report is just late). The
// animation loops visually while each await is pending — the network does not.
async function runValidation(signatureId: string): Promise<void> {
  signing.markValidating()
  const start = Date.now()
  for (let i = 0; i < VALIDATION_ATTEMPTS; i++) {
    const v = await signing.fetchValidation(signatureId)
    if (v) {
      await ensureDwell(start, MIN_DWELL_MS)
      signing.markPassed()

      return
    }
    if (i < VALIDATION_ATTEMPTS - 1) await delay(VALIDATION_RETRY_MS)
  }
  await ensureDwell(start, MIN_DWELL_MS)
  signing.markPending()
}

// "Retry validation" from the pending Complete screen: re-issue the validation request
// for the recorded signature (the signing itself is already done).
function retryValidation(): void {
  const sigId = signing.job?.signatureId
  if (sigId) void runValidation(sigId)
}

// "I've confirmed in my app" (the design's reassurance affordance on the control-code
// card): check the backend state once, immediately, instead of waiting out the current
// long-poll. Advances only on real state — the driving loop keeps polling regardless.
async function confirmNow(): Promise<void> {
  const jobId = signing.job?.jobId
  if (!jobId) return
  try {
    const j = await signing.poll(jobId, 0)
    if (signing.phase === 'confirm-in-app' && j.state !== 'FAILED' && !(j.state === 'SIGNING' && j.verificationCode)) {
      signing.markFinalizing()
    }
  } catch {
    /* the driving loop owns failure handling */
  }
}

// "Cancel signing" from the control-code card: release this attempt (the chain lock
// frees for a waiting co-signer; the push on the phone expires on the provider's own
// deadline) and leave the flow — the same exit as declining at the provider's page.
function cancelConfirm(): void {
  pollStopped = true
  const jobId = signing.job?.jobId
  if (jobId) void signing.abandon(jobId)
  goBack()
}

// The confirm window countdown (m:ss until the provider's confirm-by deadline) —
// a local ticker over the job's signingDeadline; the provider enforces the real
// deadline server-side (expiry fails the job, which the poll loop then reports).
const confirmRemaining = ref('')
let confirmTicker: number | null = null
function stopConfirmTicker(): void {
  if (confirmTicker != null) {
    clearInterval(confirmTicker)
    confirmTicker = null
  }
}
watch(
  () => signing.phase === 'confirm-in-app',
  (active) => {
    stopConfirmTicker()
    if (!active) return
    const tick = () => {
      const deadline = signing.job?.signingDeadline ?? 0
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      confirmRemaining.value = deadline ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''
    }
    tick()
    confirmTicker = window.setInterval(tick, 1000)
  },
)
onBeforeUnmount(stopConfirmTicker)

async function downloadResult(): Promise<void> {
  const containerId = signing.job?.containerId
  if (containerId) await signing.download(containerId)
}

// The pre-approval authenticate card (the dark activity card): reading/awaiting the
// card, preparing the job, handing off to a redirect provider, or the device-push
// confirm-in-app window (the control-code card). Once the user approves, the flow
// moves to the completion phases (below), which render the completion screen.
const AUTH_PHASES: SigningPhase[] = ['reading-card', 'preparing', 'awaiting-card', 'redirecting', 'confirm-in-app']
const isAuthPhase = (p: SigningPhase): boolean => AUTH_PHASES.includes(p)
const isAuthPending = computed(() => isAuthPhase(signing.phase))

// The post-approval completion screen's phase, derived from the store. The transient
// store phases right after approval (submitting the card signature, resuming from a
// redirect) map to "finalizing" so the completion card shows without a flash.
function completionPhaseFor(p: SigningPhase): 'finalizing' | 'validating' | 'passed' | 'pending' | null {
  switch (p) {
    case 'submitting':
    case 'resuming':
    case 'finalizing':
      return 'finalizing'
    case 'validating':
      return 'validating'
    case 'passed':
      return 'passed'
    case 'pending':
      return 'pending'
    default:
      return null
  }
}
const completionPhase = computed(() => completionPhaseFor(signing.phase))

// The method the eyebrow names (empty after a redirect return, where the choice isn't
// restored client-side — the card falls back to "LoA High" alone). Only the device-push
// flow (eID Scan) reaches the confirm-in-app window, so there its name is known even
// after a redirect return wiped the client-side choice.
const methodLabel = computed(() => {
  if (selectedFlow.value) return t(`signing.method.${selectedFlow.value}`)
  if (signing.phase === 'confirm-in-app') return t('signing.method.eidScan')

  return ''
})

// The authenticate card has three shapes: the in-browser card handshake (a two-step
// checklist) for the card-read phases, the control-code card for the device-push
// confirm-in-app window (eID Scan — the user matches the code on their phone before
// authorizing), and a generic waiting card (a pulsing dot) for the redirect/preparing
// phases (those authorise on the provider's page, so there is no in-SPA code). All
// three advance on real backend state.
const authKind = computed<'card' | 'confirm' | 'remote'>(() => {
  if (['reading-card', 'awaiting-card'].includes(signing.phase)) return 'card'
  if (signing.phase === 'confirm-in-app') return 'confirm'

  return 'remote'
})
// In the card handshake, step 1 (read the card) completes when we move to awaiting the
// signature, where step 2 (the browser/PIN prompt) becomes the active one.
const cardStep1Done = computed(() => signing.phase === 'awaiting-card')

// A missing Web eID extension/app gets its own "what you need" guidance card (install
// link + retry), distinct from a generic signing failure.
const isExtMissing = computed(
  () => signing.phase === 'failed' && signing.errorKey === 'signing.error.cardMissing',
)

// Another party is signing this document right now (the co-sign serialization gate).
// This is an advisory to wait and retry — not a failure — so it renders as a neutral
// warning, not a red error card. Nothing was lost; the signer just tries again shortly.
const isInProgress = computed(
  () => signing.phase === 'failed' && signing.errorKey === 'signing.error.inProgress',
)

// Waiting-for-the-other-party UX layered on the in-progress advisory: instead of a
// static "try again", long-poll the chain and tell the co-signer the moment it's their
// turn (chainReady), falling back to a manual retry if the wait window elapses.
const chainWaiting = ref(false)
const chainReady = ref(false)
let chainWaitAbort: AbortController | null = null

async function startChainWait(): Promise<void> {
  if (!envelopeId.value) return
  chainWaitAbort?.abort()
  const ac = new AbortController()
  chainWaitAbort = ac
  chainWaiting.value = true
  chainReady.value = false
  const free = await signing.waitChainFree(envelopeId.value, ac.signal)
  if (ac.signal.aborted) return
  chainWaiting.value = false
  chainReady.value = free
}

// Auto-wait the moment a co-sign is refused as in-progress.
watch(isInProgress, (now) => {
  if (now) void startChainWait()
})

// Retry the signing (from "sign now" once free, or a manual "try again").
function retrySigning(): void {
  chainWaitAbort?.abort()
  chainWaiting.value = false
  chainReady.value = false
  const flow = selectedFlow.value || flows.value[0]
  if (flow) void sign(flow)
}

function cancelWaitAndBack(): void {
  chainWaitAbort?.abort()
  goBack()
}

onBeforeUnmount(() => {
  pollStopped = true
  chainWaitAbort?.abort()
})

// The stepper continues the flow from the new-signing screen. A wizard self-sign
// shows all six steps (1–3 done before this screen); a co-signer's slot-sign shows just the
// signing sub-steps. Method while picking, Authenticate while the job runs, Complete when done.
const stepLabels = computed(() =>
  (fromWizard.value
    ? ['document', 'review', 'recipients', 'method', 'authenticate', 'complete']
    : ['method', 'authenticate', 'complete']
  ).map((k) => t(`newSigning.step.${k}`)),
)
// A failure lands the store on "failed", which by itself no longer says which
// step it happened on — resolve against the step the flow was actually in
// right before it failed, so the stepper never falsely collapses back to
// Method for an Authenticate/Complete failure.
const stepCurrent = computed(() => {
  const methodIdx = fromWizard.value ? 3 : 0
  const effective = signing.phase === 'failed' ? signing.failedFrom ?? signing.phase : signing.phase
  if (completionPhaseFor(effective)) return methodIdx + 2 // Complete
  if (isAuthPhase(effective)) return methodIdx + 1 // Authenticate

  return methodIdx // Method
})
// While a backend job runs under the final step (finalizing/validating), the Complete
// step pulses ("in-progress"); once a verdict lands it settles to solid (done).
const stepPulse = computed(
  () => completionPhase.value === 'finalizing' || completionPhase.value === 'validating',
)

// Return where this signing was entered from: the documents home for a wizard
// self-sign, otherwise the document's hub (with the envelope pre-resolved).
function goBack(): void {
  if (fromWizard.value) {
    router.push({ name: 'documents' })

    return
  }
  router.push({ name: 'document-hub', params: { id: documentId.value }, query: { env: envelopeId.value } })
}
</script>

<template>
  <AppShell>
    <!-- The validation result is its own full-page screen (not a modal). -->
    <ValidationReport
      v-if="showReport && signing.validation"
      :validation="signing.validation"
      @back="showReport = false"
    />

    <div v-else class="mx-auto max-w-2xl">
      <!-- The completion screen carries its own headline ("Signed & sealed") and the
           waiting card its own title, so the page h1/subtitle step aside there. -->
      <h1 v-if="!completionPhase" class="text-3xl font-bold tracking-tight text-ink">{{ t('signing.title') }}</h1>
      <p v-if="signing.phase === 'idle'" class="mt-1 text-sm text-muted">{{ t('signing.subtitle') }}</p>

      <!-- One continuous stepper — continues the new-signing flow into signing. -->
      <SigningStepper
        class="mt-6"
        :steps="stepLabels"
        :current="stepCurrent"
        :pulse="stepPulse"
        :label="t('signing.title')"
      />

      <!-- Method step — permitted methods as selectable cards (only the flows the login
           allows). A single permitted flow auto-advances (handled in onMounted). -->
      <section v-if="signing.phase === 'idle'" class="mt-6">
        <template v-if="flows.length > 0">
          <p class="text-sm text-muted">{{ t('signing.chooseSub') }}</p>

          <div class="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" :aria-label="t('signing.subtitle')">
            <div v-for="f in flows" :key="f" class="min-w-0">
              <button
                type="button"
                role="radio"
                :aria-checked="selectedFlow === f"
                class="flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                :class="selectedFlow === f ? 'border-green bg-green-soft' : 'border-line bg-surface hover:bg-band'"
                @click="selectedFlow = f"
              >
                <span
                  class="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2"
                  :class="selectedFlow === f ? 'border-green' : 'border-line-2'"
                  aria-hidden="true"
                >
                  <span v-if="selectedFlow === f" class="h-2 w-2 rounded-full bg-green" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-ink">{{ t(`signing.method.${f}`) }}</span>
                    <span class="rounded-chip bg-band px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2">
                      {{ t(`signing.methodTag.${f}`) }}
                    </span>
                  </span>
                  <span class="mt-1 block text-[13px] leading-snug text-muted">{{ t(`signing.methodDesc.${f}`) }}</span>
                  <!-- Exactly one seal: the card names it; no pick is needed. -->
                  <span
                    v-if="f === flowEseal && seals.length === 1"
                    class="mt-1 block font-mono text-[11px] text-muted-2"
                  >
                    {{ seals[0].label }}
                  </span>
                </span>
              </button>
              <!-- Several seals: selecting the e-seal method unfolds the picker in
                   place; Continue stays blocked until one is picked. -->
              <div
                v-if="f === flowEseal && sealPickerOpen"
                class="ml-8 mt-2 space-y-2 border-l-2 border-green-soft-line pl-3"
                role="radiogroup"
                :aria-label="t('signing.sealPicker')"
              >
                <button
                  v-for="s in seals"
                  :key="s.id"
                  type="button"
                  role="radio"
                  :aria-checked="selectedSealId === s.id"
                  class="flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                  :class="selectedSealId === s.id ? 'border-green bg-green-soft' : 'border-line bg-surface hover:bg-band'"
                  @click="selectedSealId = s.id"
                >
                  <span
                    class="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border-2"
                    :class="selectedSealId === s.id ? 'border-green' : 'border-line-2'"
                    aria-hidden="true"
                  >
                    <span v-if="selectedSealId === s.id" class="h-1.5 w-1.5 rounded-full bg-green" />
                  </span>
                  <span class="min-w-0 text-[13.5px] font-semibold text-ink">{{ s.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- What this means -->
          <div class="mt-5 rounded-card border border-green-soft-line bg-green-soft p-4">
            <p class="eyebrow text-green-deep">{{ t('signing.means.eyebrow') }}</p>
            <p class="mt-2 text-[13.5px] leading-relaxed text-green-deep">{{ t('signing.means.body') }}</p>
          </div>

          <div class="mt-6 flex justify-between">
            <Button variant="outline" @click="goBack">{{ t('common.back') }}</Button>
            <Button :disabled="continueBlocked" @click="sign(selectedFlow)">
              {{ t('signing.signCta') }}
            </Button>
          </div>
        </template>

        <!-- No permitted method for this login. -->
        <div v-else class="rounded-card border border-line bg-surface p-6 shadow-card">
          <p class="text-sm text-muted">{{ t('signing.noFlows') }}</p>
          <div class="mt-6">
            <Button variant="ghost" size="sm" @click="goBack">{{ t('common.back') }}</Button>
          </div>
        </div>
      </section>

      <!-- Authenticate (pre-approval) — dark activity card. Covers the card handshake
           (reading-card / awaiting-card), the device-push confirm-in-app window (eID
           Scan — the control-code card: the user matches the code on their phone before
           authorizing), and the redirect/preparing waits (those authorise on the
           provider's page, so no in-SPA code there). The card is a live status display
           that advances on real backend state; once the user approves, the flow moves
           to the completion screen below. -->
      <section v-else-if="isAuthPending" class="mt-8 text-center" role="status" aria-live="polite">
        <p v-if="methodLabel" class="eyebrow text-green-deep">
          {{ t('signing.loaHigh', { method: methodLabel }) }}
        </p>
        <h2 class="mt-4 text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {{ t(`signing.auth.${authKind}.title`) }}
        </h2>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted">{{ t(`signing.auth.${authKind}.body`, { method: methodLabel }) }}</p>

        <div class="mx-auto mt-7 max-w-[420px] rounded-[18px] bg-console p-7 text-left shadow-console-deep">
          <!-- In-browser card handshake: two steps. -->
          <template v-if="authKind === 'card'">
            <div class="flex items-center gap-3 border-b border-console-line pb-3.5">
              <span class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-green-bright/15 font-mono text-[12px] font-bold text-green-bright">1</span>
              <span class="text-sm text-console-text">{{ t('signing.auth.card.step1') }}</span>
              <svg v-if="cardStep1Done" width="16" height="16" viewBox="0 0 24 24" fill="none" class="ml-auto shrink-0" aria-hidden="true">
                <path d="M5 12.5l4 4 10-11" stroke="#2bd18c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span v-else class="ml-auto h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-console-line border-t-green-bright" aria-hidden="true" />
            </div>
            <div class="flex items-center gap-3 pt-3.5" :class="cardStep1Done ? '' : 'opacity-50'">
              <span class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[#222A30] font-mono text-[12px] font-bold text-console-muted">2</span>
              <span class="text-sm text-console-text">{{ t('signing.auth.card.step2') }}</span>
              <span v-if="cardStep1Done" class="ml-auto h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-console-line border-t-green-bright" aria-hidden="true" />
            </div>
          </template>
          <!-- Device-push confirm (eID Scan): the control code + the prompt the app on
               the phone shows (both must match), a live waiting pulse, and the
               confirm-by countdown. -->
          <div v-else-if="authKind === 'confirm'" class="flex flex-col items-center py-2">
            <span class="font-mono text-[11px] uppercase tracking-[0.12em] text-console-muted">
              {{ t('signing.confirm.codeLabel') }}
            </span>
            <span class="mt-3.5 font-mono text-[52px] font-bold leading-none tracking-[0.08em] text-white">
              {{ signing.job?.verificationCode }}
            </span>
            <span
              v-if="signing.job?.verificationMessage"
              class="mt-4 max-w-[300px] text-center text-[13.5px] leading-snug text-console-text"
            >
              {{ signing.job.verificationMessage }}
            </span>
            <span class="mt-5 flex items-center gap-2.5">
              <span class="relative grid h-3 w-3 place-items-center" aria-hidden="true">
                <span class="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-green-bright opacity-75" />
                <span class="relative inline-flex h-3 w-3 rounded-full bg-green-bright" />
              </span>
              <span class="text-[13px] text-console-muted">{{ t('signing.confirm.waiting') }}</span>
            </span>
            <span v-if="confirmRemaining" class="mt-2.5 font-mono text-[12px] text-console-muted">
              {{ t('signing.confirm.expires', { time: confirmRemaining }) }}
            </span>
          </div>
          <!-- Generic wait: pulsing dot + the live phase status. -->
          <div v-else class="flex flex-col items-center py-1">
            <span class="relative mb-3 grid h-3 w-3 place-items-center" aria-hidden="true">
              <span class="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-green-bright opacity-75" />
              <span class="relative inline-flex h-3 w-3 rounded-full bg-green-bright" />
            </span>
            <span class="text-[13px] text-console-muted">{{ t(`signing.phase.${signing.phase}`) }}</span>
          </div>
        </div>

        <!-- The confirm card's actions: an immediate re-check, static guidance for a
             stuck phone (nothing to deep-link on a desktop browser), and a way out. -->
        <div v-if="authKind === 'confirm'" class="mt-6 flex flex-col items-center gap-3">
          <Button @click="confirmNow">{{ t('signing.confirm.done') }}</Button>
          <p class="text-[13.5px] text-muted">{{ t('signing.confirm.help') }}</p>
          <button
            type="button"
            class="text-[13px] text-muted-2 transition-colors hover:text-ink"
            @click="cancelConfirm"
          >
            {{ t('signing.confirm.cancel') }}
          </button>
        </div>
      </section>

      <!-- Post-approval completion: finalizing → validating → passed | pending. The page
           stepper above carries the final step's in-progress/done state. -->
      <SigningCompletion
        v-else-if="completionPhase"
        class="mt-10"
        :phase="completionPhase"
        :method="methodLabel"
        :validation="signing.validation"
        :can-download="!!signing.job?.containerId"
        :back-to-hub="!fromWizard"
        @view-report="showReport = true"
        @retry="retryValidation"
        @download="downloadResult"
        @back="goBack"
      />

      <!-- Extension missing (card signing) — what-you-need guidance + install link. -->
      <ExtensionMissingCard
        v-else-if="isExtMissing"
        class="mt-6"
        @retry="sign(selectedFlow)"
        @another="signing.reset()"
      />

      <!-- Another party is signing now — an advisory, not a failure. While waiting, the
           co-signer long-polls the chain and is told the moment it's their turn. -->
      <section
        v-else-if="isInProgress"
        class="mt-6 flex items-start gap-3 rounded-card border p-4"
        :class="chainReady ? 'border-green-soft-line bg-green-soft' : 'border-amber-line bg-amber-bg'"
        role="status"
        aria-live="polite"
      >
        <span
          v-if="chainWaiting"
          class="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-fg/30 border-t-amber-fg"
          aria-hidden="true"
        />
        <svg v-else-if="chainReady" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" class="mt-0.5 shrink-0 text-green-deep" aria-hidden="true">
          <path d="M5 12.5l4 4 10-11" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 shrink-0 text-amber-fg" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="min-w-0">
          <template v-if="chainReady">
            <p class="text-[13.5px] font-medium text-green-deep">{{ t('signing.inProgressWait.ready') }}</p>
            <div class="mt-3 flex flex-wrap gap-3">
              <Button size="sm" @click="retrySigning">{{ t('signing.inProgressWait.signNow') }}</Button>
              <Button variant="ghost" size="sm" @click="cancelWaitAndBack">{{ t('common.back') }}</Button>
            </div>
          </template>
          <template v-else-if="chainWaiting">
            <p class="text-[13.5px] text-amber-fg">{{ t('signing.inProgressWait.waiting') }}</p>
            <div class="mt-3">
              <Button variant="ghost" size="sm" @click="cancelWaitAndBack">{{ t('common.back') }}</Button>
            </div>
          </template>
          <template v-else>
            <p class="text-[13.5px] text-amber-fg">{{ t('signing.error.inProgress') }}</p>
            <div class="mt-3 flex flex-wrap gap-3">
              <Button variant="outline" size="sm" @click="retrySigning">{{ t('signing.retry') }}</Button>
              <Button variant="ghost" size="sm" @click="cancelWaitAndBack">{{ t('common.back') }}</Button>
            </div>
          </template>
        </div>
      </section>

      <!-- Failed -->
      <section
        v-else-if="signing.phase === 'failed'"
        class="mt-6 rounded-card border border-line bg-surface p-6 shadow-card"
        role="alert"
      >
        <p class="text-sm text-red-fg">{{ t(signing.errorKey ?? 'signing.error.generic') }}</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" @click="signing.reset()">{{ t('signing.retry') }}</Button>
          <Button variant="ghost" size="sm" @click="goBack">{{ t('common.back') }}</Button>
        </div>
      </section>
    </div>
  </AppShell>
</template>
