import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AuditTrail, { type TrailEvent } from './AuditTrail.vue'

const events: TrailEvent[] = [
  { key: 'uploaded', title: 'Document uploaded', sub: 'a.pdf · Jul 18, 2026', tone: 'gray' },
  { key: 'signed', title: 'Signed by Anna', sub: 'Jul 18, 2026 14:21', tone: 'green' },
  { key: 'waiting', title: 'Waiting for a signature', sub: 'Jānis', tone: 'amber' },
  { key: 'completed', title: 'Envelope completed', tone: 'seal' },
]

describe('AuditTrail', () => {
  it('renders every event with its title and sub-line', () => {
    const w = mount(AuditTrail, { props: { label: 'Audit trail', events } })

    expect(w.text()).toContain('Audit trail')
    for (const ev of events) {
      expect(w.text()).toContain(ev.title)
      if (ev.sub) expect(w.text()).toContain(ev.sub)
    }
    expect(w.findAll('li')).toHaveLength(events.length)
  })

  it('marks trust events with a check and keeps lifecycle dots plain', () => {
    const w = mount(AuditTrail, { props: { label: 'Audit trail', events } })

    // Green + seal events carry the check glyph; gray/amber carry a plain dot.
    expect(w.findAll('svg')).toHaveLength(2)
  })

  it('renders nothing between events when there is a single event', () => {
    const w = mount(AuditTrail, {
      props: { label: 'Audit trail', events: [events[0]] },
    })

    // No connector thread after the last (only) event.
    expect(w.find('li span[aria-hidden="true"].absolute').exists()).toBe(false)
  })
})
