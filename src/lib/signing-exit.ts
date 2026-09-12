// Where a person goes when they leave the signing screen — the "Back to document"
// action on the completion screen, and the same exit after a cancel.
//
// It exists because the destination cannot be read off the URL. A signing that
// authorises on the provider's own page comes back to a return address the platform
// built for it, and that address carries the job and nothing else — the document id the
// screen was opened with is gone by the time the person is finished. A route pushed with
// a missing parameter is REJECTED by the router, which shows up as a button that does
// nothing at all: no navigation, no error, a person stuck on the last screen of a
// signing they completed.
//
// So the document is resolved from the envelope this signing belongs to, which the
// screen has already loaded, and there is always a destination: the documents home is a
// worse answer than the document itself, and an infinitely better one than nowhere.
import type { EnvelopeDetail } from '@/stores/envelopes'

export interface ExitRoute {
  name: string
  params?: Record<string, string>
  query?: Record<string, string>
}

export interface SigningExitInput {
  // A signing started in the wizard continues to the documents home: its envelope work
  // is done and it has no separate document view to return to.
  fromWizard: boolean
  // The envelope whose slot was signed, from the route.
  envelopeId: string
  // The document id the screen was opened with, when the entry point carried one.
  documentIdFromQuery: string
  // The composed envelope, as loaded by the signing screen.
  detail: EnvelopeDetail | null
}

export function signingExit(input: SigningExitInput): ExitRoute {
  if (input.fromWizard) return { name: 'documents' }

  const documentId = input.documentIdFromQuery || documentOfEnvelope(input)
  if (!documentId || !input.envelopeId) return { name: 'documents' }

  return {
    name: 'document-hub',
    params: { id: documentId },
    query: { env: input.envelopeId },
  }
}

// The document the envelope covers — only when the loaded envelope really is the one
// being signed. A detail left over from another envelope would send somebody to
// somebody else's document, which is worse than not navigating.
function documentOfEnvelope({ detail, envelopeId }: SigningExitInput): string {
  if (!detail || !envelopeId || detail.envelope.id !== envelopeId) return ''

  return detail.documents[0]?.documentId ?? ''
}
