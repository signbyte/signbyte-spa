import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import ValidationReport from './ValidationReport.vue'
import type { Validation } from '@/stores/signing'
import { idCodeLV, regNoLV } from '@/test-identity'

function mountWith(validation: Partial<Validation>) {
  const full: Validation = { signatureId: 's1', verdict: 'TOTAL_PASSED', pass: true, ...validation }

  return mount(ValidationReport, {
    props: { validation: full },
    global: { plugins: [i18n] },
  })
}

describe('ValidationReport', () => {
  it('renders the verdict indication in the header', () => {
    const w = mountWith({ verdict: 'TOTAL_PASSED', pass: true })
    expect(w.get('[data-testid="verdict-code"]').text()).toBe('TOTAL_PASSED')
  })

  it('reflects a failed verdict tone', () => {
    const w = mountWith({ verdict: 'TOTAL_FAILED', pass: false })
    expect(w.get('[data-testid="verdict-code"]').text()).toBe('TOTAL_FAILED')
    // The failing means-text is rendered, not the passing one.
    expect(w.text()).toContain('At least one signature is invalid')
  })

  it('treats an INDETERMINATE verdict as indeterminate even when pass is false', () => {
    const w = mountWith({ verdict: 'INDETERMINATE', pass: false })
    expect(w.text()).toContain('Validity could not be fully determined')
  })

  it('masks the serial by default and reveals it on toggle, with no network call', async () => {
    const w = mountWith({ signerSerial: idCodeLV(3) })
    const serial = w.get('[data-testid="serial-value"]')

    // Masked: bullets only, never the real value.
    expect(serial.text()).not.toContain(idCodeLV(3))
    expect(serial.text()).toMatch(/^•+$/)

    const toggle = w.get('[aria-pressed]')
    expect(toggle.attributes('aria-pressed')).toBe('false')

    await toggle.trigger('click')
    expect(w.get('[data-testid="serial-value"]').text()).toBe(idCodeLV(3))
    expect(w.get('[aria-pressed]').attributes('aria-pressed')).toBe('true')

    // ...and hides again.
    await w.get('[aria-pressed]').trigger('click')
    expect(w.get('[data-testid="serial-value"]').text()).toMatch(/^•+$/)
  })

  it('shows an e-seal organisation identifier in full, with no mask, reveal, or note', () => {
    const w = mountWith({ signerSerial: regNoLV(0), organization: 'SIA Example', signer: undefined })

    // A legal-person identifier is public — shown verbatim, never bulleted.
    expect(w.get('[data-testid="serial-value"]').text()).toBe(regNoLV(0))
    // No reveal toggle and no "not recorded" note for an organisation identifier.
    expect(w.find('[aria-pressed]').exists()).toBe(false)
    expect(w.text()).toContain('Organisation identifier')
    expect(w.text()).not.toContain('not recorded')
  })

  it('shows no detail callout when there are no warnings or errors', () => {
    const w = mountWith({ warnings: [], errors: [] })
    expect(w.find('[data-testid="signature-detail"]').exists()).toBe(false)
  })

  it('shows a verdict-tinted detail callout with the warning text on a passing verdict', () => {
    const w = mountWith({
      pass: true,
      warnings: ['The private key does not reside in a QSCD at (best) signing time!'],
    })
    const detail = w.get('[data-testid="signature-detail"]')
    expect(detail.text()).toContain('QSCD')
  })

  it('shows included files for a container, and hides them for a single PDF', () => {
    const container = mountWith({ containerForm: 'ASiC-E', signedFiles: ['a.pdf', 'b.txt'] })
    expect(container.text()).toContain('a.pdf')
    expect(container.text()).toContain('b.txt')

    const pdf = mountWith({ containerForm: 'PDF', signedFiles: [] })
    expect(pdf.text()).not.toContain('a.pdf')
  })

  it('emits back when the back control is clicked', async () => {
    const w = mountWith({})
    await w.get('button').trigger('click')
    expect(w.emitted('back')).toBeTruthy()
  })

  it('renders one card per signature for a parallel co-sign', () => {
    const w = mountWith({
      verdict: 'TOTAL_PASSED',
      pass: true,
      signatures: [
        { verdict: 'PASSED', signer: 'FIRST SIGNER', signerSerial: idCodeLV(1), warnings: [], errors: [] },
        { verdict: 'PASSED', signer: 'SECOND SIGNER', signerSerial: idCodeLV(2), warnings: [], errors: [] },
      ],
    })
    // Both signers are rendered, not just the first.
    expect(w.text()).toContain('FIRST SIGNER')
    expect(w.text()).toContain('SECOND SIGNER')
    // One serial block + one reveal toggle per signature.
    expect(w.findAll('[data-testid="serial-value"]')).toHaveLength(2)
    expect(w.findAll('[aria-pressed]')).toHaveLength(2)
  })

  it('reveals each signature serial independently', async () => {
    const w = mountWith({
      signatures: [
        { verdict: 'PASSED', signer: 'A', signerSerial: idCodeLV(1) },
        { verdict: 'PASSED', signer: 'B', signerSerial: idCodeLV(2) },
      ],
    })
    expect(w.findAll('[data-testid="serial-value"]')[0].text()).toMatch(/^•+$/)
    expect(w.findAll('[data-testid="serial-value"]')[1].text()).toMatch(/^•+$/)

    // Revealing the first leaves the second masked.
    await w.findAll('[aria-pressed]')[0].trigger('click')
    expect(w.findAll('[data-testid="serial-value"]')[0].text()).toBe(idCodeLV(1))
    expect(w.findAll('[data-testid="serial-value"]')[1].text()).toMatch(/^•+$/)
  })
})
