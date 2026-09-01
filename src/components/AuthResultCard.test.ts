import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthResultCard from './AuthResultCard.vue'

describe('AuthResultCard', () => {
  it('returning variant is a polite status with a spinner and no icon', () => {
    const w = mount(AuthResultCard, {
      props: { variant: 'returning', title: 'Signing you in', body: 'Hold on' },
    })
    const root = w.get('div')
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
    expect(w.find('.animate-spin').exists()).toBe(true)
    // The returning state shows a bordered spinner, not the failed X glyph.
    expect(w.find('svg').exists()).toBe(false)
    expect(w.text()).toContain('Signing you in')
  })

  it('failed variant is an alert with the X badge and renders slotted actions', () => {
    const w = mount(AuthResultCard, {
      props: { variant: 'failed', title: 'Did not complete', body: 'No session was created' },
      slots: { default: '<button>Try again</button>' },
    })
    const root = w.get('div')
    expect(root.attributes('role')).toBe('alert')
    expect(root.attributes('aria-live')).toBeUndefined()
    expect(w.find('svg').exists()).toBe(true)
    expect(w.find('.animate-spin').exists()).toBe(false)
    expect(w.find('.mt-6').exists()).toBe(true)
    expect(w.text()).toContain('Try again')
  })

  it('omits the actions row when nothing is slotted', () => {
    const w = mount(AuthResultCard, {
      props: { variant: 'failed', title: 't', body: 'b' },
    })
    expect(w.find('.mt-6').exists()).toBe(false)
  })
})
