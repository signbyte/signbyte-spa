import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ValidatingCard from './ValidatingCard.vue'

const PROPS = {
  context: 'Lease-Agreement-2026.asice',
  caption: 'Validating signature · EU DSS',
  title: 'Validating the signature…',
  body: 'Independently checking it against eIDAS rules.',
  label: 'Validating…',
}

describe('ValidatingCard', () => {
  it('renders the context, caption, copy and working label it is given', () => {
    const w = mount(ValidatingCard, { props: PROPS })

    expect(w.get('[data-testid="validating-card"]').attributes('role')).toBe('status')
    for (const text of Object.values(PROPS)) {
      expect(w.text()).toContain(text)
    }
  })

  it('carries the scan sweep and progress affordances (no verdict cue)', () => {
    const w = mount(ValidatingCard, { props: PROPS })

    expect(w.find('.scan-bar').exists()).toBe(true)
    expect(w.find('.bar-sweep').exists()).toBe(true)
    // The element stays outcome-neutral: no pass/fail wording of its own.
    expect(w.text()).not.toMatch(/passed|valid\b|failed/i)
  })
})
