import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import SigningCompletion from './SigningCompletion.vue'
import type { Validation } from '@/stores/signing'

type Phase = 'finalizing' | 'validating' | 'passed' | 'pending'

const PASSED: Validation = {
  signatureId: 's1',
  verdict: 'TOTAL_PASSED',
  pass: true,
  format: 'XAdES-BASELINE-LT',
  level: 'QES',
  containerForm: 'ASiC-E',
  signingTime: '2026-06-18T09:42:00Z',
  signedFiles: ['Lease-Agreement-2026.pdf'],
}

function mountWith(phase: Phase, validation: Validation | null, extra: Record<string, unknown> = {}) {
  return mount(SigningCompletion, {
    props: { phase, validation, method: 'eParaksts Mobile', canDownload: true, backToHub: false, ...extra },
    global: { plugins: [i18n] },
  })
}

describe('SigningCompletion', () => {
  it('shows the waiting card (not the complete screen) while finalizing', () => {
    const w = mountWith('finalizing', null)
    expect(w.find('[data-testid="waiting-card"]').exists()).toBe(true)
    expect(w.find('[data-testid="complete"]').exists()).toBe(false)
    expect(w.text()).toContain('Finalizing your signed document')
  })

  it('shows the validating caption + scan while validating', () => {
    const w = mountWith('validating', null)
    expect(w.find('[data-testid="waiting-card"]').exists()).toBe(true)
    expect(w.text()).toContain('Validating your signature')
  })

  it('renders the passed Complete screen with the real verdict and no pending banner', () => {
    const w = mountWith('passed', PASSED)
    expect(w.find('[data-testid="complete"]').exists()).toBe(true)
    expect(w.find('[data-testid="waiting-card"]').exists()).toBe(false)
    expect(w.get('[data-testid="status-value"]').text()).toBe('TOTAL_PASSED')
    expect(w.find('[data-testid="pending-banner"]').exists()).toBe(false)
    // The signed-&-sealed headline + the result-card facts from the validation answer.
    expect(w.text()).toContain('Signed & sealed')
    expect(w.text()).toContain('XAdES-BASELINE-LT')
    expect(w.text()).toContain('2026-06-18 09:42')
  })

  it('renders the pending Complete screen as success: same headline, amber status, banner', () => {
    const w = mountWith('pending', null)
    expect(w.find('[data-testid="complete"]').exists()).toBe(true)
    expect(w.text()).toContain('Signed & sealed')
    expect(w.get('[data-testid="status-value"]').text()).toBe('VALIDATION PENDING')
    expect(w.find('[data-testid="pending-banner"]').exists()).toBe(true)
  })

  it('offers View report on passed and Retry validation on pending', () => {
    expect(mountWith('passed', PASSED).text()).toContain('View validation report')

    const pending = mountWith('pending', null)
    expect(pending.text()).toContain('Retry validation')
    expect(pending.text()).not.toContain('View validation report')
  })

  it('emits the action events the host wires to the flow', async () => {
    const w = mountWith('passed', PASSED)
    const buttons = w.findAll('button')
    // View report (primary), Download (outline), Back (ghost).
    await buttons[0].trigger('click')
    expect(w.emitted('viewReport')).toBeTruthy()
  })

  it('falls back to "LoA High" alone when no method is known (redirect return)', () => {
    const w = mountWith('finalizing', null, { method: '' })
    expect(w.text()).toContain('LoA High')
  })
})
