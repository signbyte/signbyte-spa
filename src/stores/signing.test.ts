import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSigningStore } from './signing'
import { api, ApiError } from '@/lib/api'
import { idCodeLV, subjectCN } from '@/test-identity'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn(), download: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)
const mockDownload = vi.mocked(api.download)

describe('signing store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('begins the in-browser flow through the slot endpoint and returns the digests to sign', async () => {
    mockPost.mockResolvedValue({
      jobId: 'job-1',
      state: 'AWAITING_CLIENT_SIGNATURE',
      signAlgorithm: 'RSA_SHA256',
      documents: [{ documentId: 'doc-1', digest: 'ZGlnZXN0', digestAlgorithm: 'SHA-256' }],
    })

    const store = useSigningStore()
    const job = await store.beginSlot('env-1', 's-1', {
      documentId: 'doc-1',
      flow: 'webEid',
      sigFormat: 'XAdES',
      signingCertificate: 'MIIsign',
      authCertificate: 'MIIauth',
    })

    expect(mockPost).toHaveBeenCalledWith('/envelopes/env-1/slots/s-1/sign', {
      documentId: 'doc-1',
      flow: 'webEid',
      sigFormat: 'XAdES',
      signingCertificate: 'MIIsign',
      authCertificate: 'MIIauth',
    })
    expect(job.documents).toHaveLength(1)
    expect(job.documents?.[0].digest).toBe('ZGlnZXN0')
    expect(store.job?.jobId).toBe('job-1')
  })

  it('maps a binding mismatch to its own guidance key and rethrows', async () => {
    mockPost.mockRejectedValue(new ApiError(403, 'err:signing:bindingMismatch', { code: 'err:signing:bindingMismatch' }))

    const store = useSigningStore()
    await expect(
      store.beginSlot('env-1', 's-1', { documentId: 'doc-1', flow: 'eidScan', sigFormat: 'XAdES' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(store.phase).toBe('failed')
    expect(store.errorKey).toBe('signing.error.binding')
  })

  it('maps a missing-certificate rejection to the invalid-request key', async () => {
    mockPost.mockRejectedValue(new ApiError(400, 'err:signing:invalidRequest', { code: 'err:signing:invalidRequest' }))

    const store = useSigningStore()
    await expect(
      store.beginSlot('env-1', 's-1', { documentId: 'doc-1', flow: 'webEid', sigFormat: 'XAdES' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(store.errorKey).toBe('signing.error.invalid')
  })

  it('maps an upstream failure to the shared upstream key', async () => {
    mockPost.mockRejectedValue(new ApiError(502, 'err:upstream:unavailable', {}))

    const store = useSigningStore()
    await expect(
      store.beginSlot('env-1', 's-1', { documentId: 'doc-1', flow: 'eparakstsMobile', sigFormat: 'XAdES' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(store.errorKey).toBe('errors.upstream')
  })

  it('begins signing one envelope slot through the slot endpoint', async () => {
    mockPost.mockResolvedValue({ jobId: 'job-3', state: 'AWAITING_AUTHORIZATION', authorizeUrl: 'https://idp/y' })

    const store = useSigningStore()
    const job = await store.beginSlot('env-1', 's-1', {
      documentId: 'doc-1',
      flow: 'eparakstsMobile',
      sigFormat: 'XAdES',
    })

    expect(mockPost).toHaveBeenCalledWith('/envelopes/env-1/slots/s-1/sign', {
      documentId: 'doc-1',
      flow: 'eparakstsMobile',
      sigFormat: 'XAdES',
    })
    expect(job.authorizeUrl).toBe('https://idp/y')
  })

  it('maps an ordering-gate rejection (not_eligible) to its own guidance key', async () => {
    mockPost.mockRejectedValue(new ApiError(409, 'err:envelope:notEligible', { code: 'err:envelope:notEligible' }))

    const store = useSigningStore()
    await expect(
      store.beginSlot('env-1', 's-2', { documentId: 'doc-1', flow: 'webEid', sigFormat: 'XAdES' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(store.phase).toBe('failed')
    expect(store.errorKey).toBe('signing.error.notEligible')
  })

  it('maps a keep-latest conflict (chain_advanced) to its own guidance key', async () => {
    mockGet.mockRejectedValue(new ApiError(409, 'err:document:chainAdvanced', { code: 'err:document:chainAdvanced' }))

    const store = useSigningStore()
    await expect(store.poll('job-1')).rejects.toBeInstanceOf(ApiError)

    expect(store.phase).toBe('failed')
    expect(store.errorKey).toBe('signing.error.chainAdvanced')
  })

  it('submits the card signatures to the job', async () => {
    mockPost.mockResolvedValue({ jobId: 'job-1', state: 'SIGNING' })

    const store = useSigningStore()
    const job = await store.submitClientSignature('job-1', [{ documentId: 'doc-1', signatureValue: 'sig' }])

    expect(mockPost).toHaveBeenCalledWith('/signings/job-1/client-signature', {
      signatures: [{ documentId: 'doc-1', signatureValue: 'sig' }],
    })
    expect(job.state).toBe('SIGNING')
    expect(store.phase).toBe('submitting')
  })

  it('polls the job status', async () => {
    mockGet.mockResolvedValue({ jobId: 'job-1', state: 'COMPLETED', containerId: 'cont-1', signatureId: 'sig-1' })

    const store = useSigningStore()
    const job = await store.poll('job-1')

    expect(mockGet).toHaveBeenCalledWith('/signings/job-1/status')
    expect(job.state).toBe('COMPLETED')
    expect(job.containerId).toBe('cont-1')
  })

  it('carries the device-push confirmation context through a poll (eID Scan)', async () => {
    // The confirm-in-app window: the job holds the verification code the user
    // matches on their phone + the confirm-by deadline, until the in-app approval.
    mockGet.mockResolvedValue({ jobId: 'job-1', state: 'SIGNING', verificationCode: '4821', signingDeadline: 1737467942694 })

    const store = useSigningStore()
    const job = await store.poll('job-1')

    expect(job.verificationCode).toBe('4821')
    expect(job.signingDeadline).toBe(1737467942694)
    expect(store.job?.verificationCode).toBe('4821')
  })

  it('enters the confirm-in-app phase via its mark action', () => {
    const store = useSigningStore()
    store.markConfirmInApp()
    expect(store.phase).toBe('confirm-in-app')
  })

  it('long-polls the status when a wait is given (and not otherwise)', async () => {
    mockGet.mockResolvedValue({ jobId: 'job-1', state: 'COMPLETED' })

    const store = useSigningStore()
    await store.poll('job-1')
    expect(mockGet).toHaveBeenLastCalledWith('/signings/job-1/status')

    await store.poll('job-1', 5)
    expect(mockGet).toHaveBeenLastCalledWith('/signings/job-1/status?wait=5')
  })

  it('drives the post-approval completion phases', () => {
    const store = useSigningStore()
    store.markFinalizing()
    expect(store.phase).toBe('finalizing')
    store.markValidating()
    expect(store.phase).toBe('validating')
    store.markPassed()
    expect(store.phase).toBe('passed')
    store.markPending()
    expect(store.phase).toBe('pending')
  })

  it('remembers the phase it failed from, so a failure keeps the stepper on the step that actually failed', () => {
    const store = useSigningStore()
    store.markReadingCard()
    store.fail('signing.error.card')

    expect(store.phase).toBe('failed')
    expect(store.failedFrom).toBe('reading-card')
  })

  it('captures a completion-phase failure (e.g. a poll timeout during finalize)', async () => {
    mockGet.mockRejectedValue(new ApiError(504, 'err:upstream:unavailable', {}))

    const store = useSigningStore()
    store.markFinalizing()
    await expect(store.poll('job-1')).rejects.toBeInstanceOf(ApiError)

    expect(store.failedFrom).toBe('finalizing')
  })

  it('clears the failed-from phase on reset', () => {
    const store = useSigningStore()
    store.markReadingCard()
    store.fail('signing.error.card')
    store.reset()

    expect(store.failedFrom).toBeNull()
  })

  it('fetches the validation answer for a recorded signature', async () => {
    mockGet.mockResolvedValue({ signatureId: 'sig-1', verdict: 'PASSED', pass: true, format: 'XAdES', level: 'QES' })

    const store = useSigningStore()
    const v = await store.fetchValidation('sig-1')

    expect(mockGet).toHaveBeenCalledWith('/signatures/sig-1/validation')
    expect(v?.pass).toBe(true)
    expect(store.validation?.verdict).toBe('PASSED')
  })

  it('surfaces the full validation field set from the answer', async () => {
    mockGet.mockResolvedValue({
      signatureId: 'sig-1',
      verdict: 'PASSED',
      pass: true,
      format: 'XAdES_BASELINE_LT',
      level: 'QES',
      signer: subjectCN(3),
      signerSerial: idCodeLV(3),
      containerForm: 'ASiC-E',
      signingTime: '2026-06-27T07:22:26Z',
      signedFiles: ['contract.pdf'],
      warnings: [],
      errors: [],
    })

    const store = useSigningStore()
    const v = await store.fetchValidation('sig-1')

    expect(v?.signerSerial).toBe(idCodeLV(3))
    expect(v?.containerForm).toBe('ASiC-E')
    expect(v?.signedFiles).toEqual(['contract.pdf'])
    expect(store.validation?.signingTime).toBe('2026-06-27T07:22:26Z')
  })

  it('marks the resuming phase for a redirect-flow return', () => {
    const store = useSigningStore()
    store.fail('signing.error.generic')
    store.markResuming()

    expect(store.phase).toBe('resuming')
    expect(store.errorKey).toBeNull()
  })

  it('treats a failed validation as non-fatal (null, no throw)', async () => {
    mockGet.mockRejectedValue(new ApiError(502, 'upstream_error', {}))

    const store = useSigningStore()
    const v = await store.fetchValidation('sig-1')

    expect(v).toBeNull()
  })

  it('downloads the signed container through the credentialed file path', async () => {
    mockDownload.mockResolvedValue(undefined)

    const store = useSigningStore()
    await store.download('cont-1')

    expect(mockDownload).toHaveBeenCalledWith('/documents/cont-1/download')
  })
})
