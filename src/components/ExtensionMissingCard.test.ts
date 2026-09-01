import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import ExtensionMissingCard from './ExtensionMissingCard.vue'
import { WEB_EID_INSTALL_URL } from '@/lib/webeid'

function mountCard() {
  return mount(ExtensionMissingCard, { global: { plugins: [i18n] } })
}

describe('ExtensionMissingCard', () => {
  it('renders the alert, a three-item checklist and a safe external install link', () => {
    const w = mountCard()
    expect(w.find('[role="alert"]').exists()).toBe(true)
    expect(w.findAll('li')).toHaveLength(3)
    const link = w.get('a')
    expect(link.attributes('href')).toBe(WEB_EID_INSTALL_URL)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('emits another and retry from its two buttons', async () => {
    const w = mountCard()
    const buttons = w.findAll('button')
    expect(buttons).toHaveLength(2)
    // Design order: outline "Choose another method", then primary "retry".
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(w.emitted('another')).toHaveLength(1)
    expect(w.emitted('retry')).toHaveLength(1)
  })
})
