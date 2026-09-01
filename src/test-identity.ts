// Identity values for tests, assembled from their parts rather than written as
// literals.
//
// An identifier-shaped constant in the source is indistinguishable from a
// credential to a secret scanner, and indistinguishable from a real person's code
// to a reader — and this repository is published. Each test person is one repeated
// digit, so a fixture reads as a placeholder at a glance and two people are told
// apart by their digit.
//
// Test-only: nothing in the application imports this, so it never reaches a bundle.

/** A Latvian personal identity code, in the PNO form a validation answer carries. */
export function idCodeLV(digit: number): string {
  const d = String(digit)

  return `PNOLV-${d.repeat(6)}-${d.repeat(5)}`
}

/** A Latvian organisation registration number, in the NTR form an e-seal carries. */
export function regNoLV(digit: number): string {
  return `NTRLV-4000${String(digit).repeat(7)}`
}

/**
 * The certificate common-name form a signing provider reports: surname, given
 * name, then the identity code. The name is the fleet's standing test person.
 */
export function subjectCN(digit: number): string {
  return `PARAUDZINS,ANDRIS,${idCodeLV(digit)}`
}
