// A PDF may be signed natively (PAdES) or wrapped in an ASiC-E container
// (XAdES); every other file type is always wrapped. Once a document has been
// signed at least once, the signing service is the authority on its format —
// this only decides the very first signature on a chain.
export function isPdf(mime: string): boolean {
  return mime === 'application/pdf'
}

export function deriveSigFormat(mime: string, wrapInContainer: boolean): 'PAdES' | 'XAdES' {
  return isPdf(mime) && !wrapInContainer ? 'PAdES' : 'XAdES'
}
