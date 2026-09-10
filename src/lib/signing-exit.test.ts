import { describe, it, expect } from 'vitest'
import { signingExit } from './signing-exit'
import type { EnvelopeDetail } from '@/stores/envelopes'

function detail(id = 'env-1', documentId = 'doc-1'): EnvelopeDetail {
  return {
    envelope: { id, status: 'sent', orderPolicy: 'sequential', version: 1 },
    slots: [{ id: 'slot-1', orderIndex: 0 }],
    documents: [{ documentId }],
  }
}

describe('where a person goes when they leave the signing screen', () => {
  // The case that was broken live: a co-signer signing with a redirect provider comes
  // back to `…/sign?job=…`, which carries no document id. The button did nothing.
  it('resolves the document from the envelope when the return address carries none', () => {
    expect(
      signingExit({
        fromWizard: false,
        envelopeId: 'env-1',
        documentIdFromQuery: '',
        detail: detail(),
      }),
    ).toEqual({ name: 'document-hub', params: { id: 'doc-1' }, query: { env: 'env-1' } })
  })

  it('prefers the document the screen was opened with', () => {
    const route = signingExit({
      fromWizard: false,
      envelopeId: 'env-1',
      documentIdFromQuery: 'doc-from-url',
      detail: detail('env-1', 'doc-from-envelope'),
    })
    expect(route.params?.id).toBe('doc-from-url')
  })

  it('sends a wizard signing to the documents home, whatever else is known', () => {
    expect(
      signingExit({
        fromWizard: true,
        envelopeId: 'env-1',
        documentIdFromQuery: 'doc-1',
        detail: detail(),
      }),
    ).toEqual({ name: 'documents' })
  })

  it('never returns a route it cannot form', () => {
    for (const input of [
      { fromWizard: false, envelopeId: 'env-1', documentIdFromQuery: '', detail: null },
      { fromWizard: false, envelopeId: '', documentIdFromQuery: 'doc-1', detail: null },
      { fromWizard: false, envelopeId: 'env-1', documentIdFromQuery: '', detail: detail('env-1', '') },
    ]) {
      const route = signingExit(input)
      expect(route.name).toBe('documents')
      expect(route.params).toBeUndefined()
    }
  })

  it('ignores an envelope that is not the one being signed', () => {
    // A detail left over from another envelope must never become somebody else's
    // document — the exit falls back instead.
    expect(
      signingExit({
        fromWizard: false,
        envelopeId: 'env-2',
        documentIdFromQuery: '',
        detail: detail('env-1', 'doc-1'),
      }),
    ).toEqual({ name: 'documents' })
  })

  it('always names a destination — there is no doing nothing', () => {
    const route = signingExit({
      fromWizard: false,
      envelopeId: '',
      documentIdFromQuery: '',
      detail: null,
    })
    expect(route.name).toBeTruthy()
  })
})
