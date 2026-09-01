import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/lib/api'

// The signing lifecycle, as the portal API drives it. The card-side phases
// (reading-card, awaiting-card) are the in-browser Web eID handshake; the others
// mirror the orchestrator's job states. confirm-in-app is the device-push
// confirmation window (eID Scan): the job holds a published verification code while
// the provider waits for the user to confirm on their phone — still pre-approval,
// so it renders the control-code card, not the completion screen. After the user
// approves, the post-approval completion experience runs through finalizing →
// validating → passed | pending: finalizing seals the QES, validating checks it via
// EU DSS, passed/pending are the two terminal verdicts (pending = signed, report
// late — success, not failure). failed carries a safe i18n key.
export type SigningPhase =
  | 'idle'
  | 'reading-card'
  | 'preparing'
  | 'awaiting-card'
  | 'submitting'
  | 'resuming'
  | 'redirecting'
  | 'confirm-in-app'
  | 'finalizing'
  | 'validating'
  | 'passed'
  | 'pending'
  | 'failed'

// One per-document digest the in-browser flow must sign on the card.
export interface DigestRef {
  documentId: string
  digest: string
  digestAlgorithm?: string
}

// One client-produced signature value for a document.
export interface ClientSignatureValue {
  documentId: string
  signatureValue: string
}

// The signing job as the API returns it. authorizeUrl is set for redirect flows;
// signAlgorithm + documents are set for the in-browser flow (the digests to sign);
// verificationCode, verificationMessage + signingDeadline (epoch ms) ride along
// during the device-push confirmation window (eID Scan) — the code and prompt the
// user matches on their phone; containerId + signatureId are set on completion.
export interface Job {
  jobId: string
  state: string
  authorizeUrl?: string
  signAlgorithm?: string
  verificationCode?: string
  verificationMessage?: string
  signingDeadline?: number
  documents?: DigestRef[]
  containerId?: string
  signatureId?: string
}

// The input to begin a signing of an envelope slot. The card certificates are
// present only for the in-browser flow; redirect flows omit them.
export interface BeginInput {
  documentId: string
  flow: string
  sigFormat: string
  signingCertificate?: string
  authCertificate?: string
  // Which of the user's seals signs (the e-seal flow when they hold several;
  // ids come from the session's seals). Omitted with a single seal.
  sealId?: string
}

// One signature within a validated document. A container can hold several (parallel
// co-signatures); the answer lists each so every signature is rendered, not just the
// first. signerSerial is masked by the UI with a client-side reveal.
export interface SignatureInfo {
  verdict: string
  format?: string
  level?: string
  signer?: string
  signerSerial?: string
  organization?: string
  signingTime?: string
  revocationTime?: string
  maxValidityTime?: string
  warnings?: string[]
  errors?: string[]
}

// The normalized validation answer the full-page validation report renders — the
// full eIDAS verdict. The container-level fields (verdict, containerForm, signedFiles)
// describe the whole document; signatures lists every signature it holds. The top-level
// signer/signerSerial mirror the first signature for single-signature callers; serial
// is masked by the UI with a client-side reveal (no server round-trip, never an audited
// disclosure). signedFiles is meaningful only for a container form.
export interface Validation {
  // Caller context — which recorded signature or which document was validated
  // (at most one is set by the API).
  signatureId?: string
  documentId?: string
  verdict: string
  format?: string
  level?: string
  signer?: string
  signerSerial?: string
  organization?: string
  containerForm?: string
  signingTime?: string
  revocationTime?: string
  maxValidityTime?: string
  signedFiles?: string[]
  warnings?: string[]
  errors?: string[]
  signatures?: SignatureInfo[]
  pass: boolean
  reportId?: string
  // When the validation actually ran (RFC 3339). Validation is time-anchored —
  // a cached/recent answer is rendered "as of" this moment, never as current.
  validatedAt?: string
}

// Maps a failed call to a stable i18n key the view renders — never the raw body. A
// binding mismatch (the login method does not permit the chosen flow) gets its own
// guidance key so the view can offer a re-authentication path.
function messageKey(err: unknown): string {
  if (err instanceof ApiError) {
    // Codes are the platform's err:domain:reason taxonomy, relayed from the service
    // that raised them (signflow/envelope) with the terminal code preserved.
    if (err.code === 'err:signing:bindingMismatch') return 'signing.error.binding'
    if (err.code === 'err:envelope:notEligible') return 'signing.error.notEligible'
    // Another party co-signed the same document while this signing was finalizing
    // (the keep-latest concurrency guard): review the now-latest and sign again.
    if (err.code === 'err:document:chainAdvanced') return 'signing.error.chainAdvanced'
    // Another signer is currently signing this PDF (the co-sign serialization lock):
    // a PDF signature can't be merged, so wait and try again in a moment.
    if (err.code === 'err:signing:inProgress') return 'signing.error.inProgress'
    if (err.code === 'err:signing:invalidRequest') return 'signing.error.invalid'
    if (err.status === 401) return 'errors.session'
    if (err.status === 404) return 'signing.error.notFound'
    if (err.status >= 500 || err.status === 502) return 'errors.upstream'
  }

  return 'signing.error.generic'
}

function enc(s: string): string {
  return encodeURIComponent(s)
}

export const useSigningStore = defineStore('signing', () => {
  const phase = ref<SigningPhase>('idle')
  const errorKey = ref<string | null>(null)
  const job = ref<Job | null>(null)
  const validation = ref<Validation | null>(null)
  // The phase the flow was in right before it failed (e.g. "reading-card" or
  // "finalizing") — phase itself becomes "failed" and can no longer say which
  // step that was, so the view keeps the stepper on the step that actually
  // failed instead of collapsing it back to Method.
  const failedFrom = ref<SigningPhase | null>(null)

  // Clear the store back to its starting state — called when a signing view opens.
  function reset(): void {
    phase.value = 'idle'
    errorKey.value = null
    job.value = null
    validation.value = null
    failedFrom.value = null
  }

  // Move to the terminal failed state with a safe message. Used both by the API
  // actions (on a thrown ApiError) and by the view (for a card-side failure).
  function fail(key: string): void {
    if (phase.value !== 'failed') failedFrom.value = phase.value
    errorKey.value = key
    phase.value = 'failed'
  }

  // The view-driven phases of the in-browser handshake (the API actions own the
  // rest). Kept as methods so the state machine lives in the store.
  function markReadingCard(): void {
    phase.value = 'reading-card'
    errorKey.value = null
  }
  function markAwaitingCard(): void {
    phase.value = 'awaiting-card'
  }
  function markRedirecting(): void {
    phase.value = 'redirecting'
  }
  // The browser has returned from a redirect-flow provider; show an in-progress
  // state immediately (before the first status poll) so the method picker never
  // flashes on the return.
  function markResuming(): void {
    phase.value = 'resuming'
    errorKey.value = null
  }
  // The device-push confirmation window (eID Scan): the job sits pre-approval with
  // a published verification code until the user confirms on their phone — the
  // view renders the control-code card for as long as this phase holds.
  function markConfirmInApp(): void {
    phase.value = 'confirm-in-app'
  }
  // The post-approval completion phases (the completion screen). finalizing while
  // the seal job runs; validating while the EU DSS report is fetched; passed once a
  // verdict returns; pending if validation does not return within the view's budget
  // (the signature is applied regardless — pending is success, the report is just late).
  function markFinalizing(): void {
    phase.value = 'finalizing'
  }
  function markValidating(): void {
    phase.value = 'validating'
  }
  function markPassed(): void {
    phase.value = 'passed'
  }
  function markPending(): void {
    phase.value = 'pending'
  }

  // Begin signing one envelope slot on the user's behalf — every signing is an
  // envelope slot (a self-sign is the single slot of its own envelope). The slot
  // endpoint checks the slot is eligible to sign now (under the envelope's ordering
  // policy) and refuses with a 409 not_eligible otherwise — mapped to its own
  // guidance key. For the in-browser flow the result carries the digests to sign;
  // for a redirect flow it carries the authorize URL. On failure the store is left
  // in the failed state with a safe key, and the error is rethrown so the view can
  // stop its sequence.
  async function beginSlot(envelopeId: string, slotId: string, input: BeginInput): Promise<Job> {
    phase.value = 'preparing'
    errorKey.value = null
    validation.value = null
    try {
      const j = await api.post<Job>(
        `/envelopes/${enc(envelopeId)}/slots/${enc(slotId)}/sign`,
        input,
      )
      job.value = j

      return j
    } catch (err) {
      fail(messageKey(err))
      throw err
    }
  }

  // Submit the card-produced signature value(s) back to the job.
  async function submitClientSignature(jobId: string, signatures: ClientSignatureValue[]): Promise<Job> {
    phase.value = 'submitting'
    try {
      const j = await api.post<Job>(`/signings/${enc(jobId)}/client-signature`, { signatures })
      job.value = j

      return j
    } catch (err) {
      fail(messageKey(err))
      throw err
    }
  }

  // Reconcile + return the job's current state. A positive wait long-polls: the BFF
  // holds the request up to that many seconds until the job's state changes, so the
  // post-approval wait answers the moment the seal lands instead of tight-looping.
  // The macro phase (finalizing) is owned by the view across the loop, so a single
  // poll never reassigns it.
  async function poll(jobId: string, wait = 0): Promise<Job> {
    const q = wait > 0 ? `?wait=${wait}` : ''
    try {
      const j = await api.get<Job>(`/signings/${enc(jobId)}/status${q}`)
      job.value = j

      return j
    } catch (err) {
      fail(messageKey(err))
      throw err
    }
  }

  // Fetch the normalized validation answer for a recorded signature. Best-effort:
  // the signature is already applied, so a validation hiccup must not fail the
  // signing — it returns null and the view shows the document as signed regardless.
  async function fetchValidation(signatureId: string): Promise<Validation | null> {
    try {
      const v = await api.get<Validation>(`/signatures/${enc(signatureId)}/validation`)
      validation.value = v

      return v
    } catch {
      return null
    }
  }

  // Stream the signed container to disk through the credentialed file path.
  async function download(containerId: string): Promise<void> {
    await api.download(`/documents/${enc(containerId)}/download`)
  }

  // Abandon a signing attempt's hold on its chain (the signer cancelled at the provider
  // or picked the wrong method and will retry): frees the PAdES co-sign lock so a
  // waiting co-signer isn't blocked on a dead attempt. Best-effort — releasing the lock
  // must never block the UX (the slot stays open either way; a retry re-acquires it).
  async function abandon(jobId: string): Promise<void> {
    if (!jobId) return
    try {
      await api.post(`/signings/${enc(jobId)}/abandon`)
    } catch {
      /* best-effort */
    }
  }

  // Long-poll the BFF until the envelope's chain is free to sign (the other party
  // finished or abandoned) — a blocked co-signer's "wait until it's my turn" instead of
  // a countdown or tight polling. Bounded so it never waits forever; returns true when
  // free, false on give-up/abort/error. Each call is a short server-held long-poll.
  async function waitChainFree(envelopeId: string, signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + 3 * 60 * 1000 // ~ the lock's TTL window
    while (Date.now() < deadline) {
      if (signal?.aborted) return false
      try {
        const res = await api.get<{ free: boolean }>(
          `/chain-free?envelopeId=${enc(envelopeId)}&wait=8`,
          signal,
        )
        if (res.free) return true
      } catch {
        return false
      }
    }

    return false
  }

  return {
    phase,
    errorKey,
    job,
    validation,
    failedFrom,
    reset,
    fail,
    markReadingCard,
    markAwaitingCard,
    markRedirecting,
    markResuming,
    markConfirmInApp,
    markFinalizing,
    markValidating,
    markPassed,
    markPending,
    beginSlot,
    submitClientSignature,
    poll,
    fetchValidation,
    download,
    abandon,
    waitChainFree,
  }
})
