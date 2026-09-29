import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n'
import { useSessionStore } from '@/stores/session'
import SigningView from './SigningView.vue'

// The method step as the person sees it: one card per flow the session may sign
// with, each read out of the rendered page (name, tag, description).
async function cardsFor(loginMethod: string, permittedFlows: string[], locale: 'en' | 'lv') {
  i18n.global.locale.value = locale
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().identity = {
    sub: 'user-1',
    name: 'Test Person',
    loa: 'high',
    loginMethod,
    permittedFlows,
    canEseal: null,
    seals: [],
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/envelopes/:id/slots/:slot/sign', name: 'sign', component: SigningView }],
  })
  await router.push('/envelopes/env-1/slots/slot-1/sign?doc=doc-1')
  await router.isReady()
  const w = mount(SigningView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { AppShell: { template: '<div><slot /></div>' }, SigningStepper: true },
    },
  })
  await flushPromises()

  return w.findAll('[role="radio"]').map((card) => {
    const spans = card.findAll('span')
    return {
      name: spans.find((s) => s.classes().includes('font-semibold'))?.text() ?? '',
      tag: spans.find((s) => s.classes().includes('font-mono'))?.text() ?? '',
      desc: spans.find((s) => s.classes().includes('block'))?.text() ?? '',
    }
  })
}

describe('SigningView — the CSC method cards', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'en'
  })
  afterEach(() => {
    i18n.global.locale.value = 'en'
  })

  it('a Web eID login shows the eID card and a CSC API card carrying its description', async () => {
    const cards = await cardsFor('webEid', ['webEid', 'cscEidPlugin'], 'en')
    expect(cards.map((c) => c.name)).toEqual(['eID card', 'CSC API'])
    expect(cards[1].desc).toBe(cards[0].desc)
    expect(cards[1].tag).toBe(cards[0].tag)
    expect(cards[1].desc).toBe('Sign with the ID-card in your reader. You confirm with PIN 2.')
  })

  it('an eID Scan login shows eID Scan and a CSC API card carrying its description', async () => {
    const cards = await cardsFor('eidScan', ['eidScan', 'cscEidScan'], 'en')
    expect(cards.map((c) => c.name)).toEqual(['eID Scan', 'CSC API'])
    expect(cards[1].desc).toBe(cards[0].desc)
    expect(cards[1].tag).toBe(cards[0].tag)
  })

  it('draws the CSC API card in Latvian too, with the sibling card’s Latvian words', async () => {
    for (const [login, flows] of [
      ['webEid', ['webEid', 'cscEidPlugin']],
      ['eidScan', ['eidScan', 'cscEidScan']],
    ] as const) {
      const cards = await cardsFor(login, [...flows], 'lv')
      expect(cards[1].name).toBe('CSC API')
      expect(cards[1].desc).toBe(cards[0].desc)
      expect(cards[1].desc).not.toBe('')
      expect(cards[1].desc).not.toContain('signing.')
    }
  })

  it('an eParaksts Mobile login shows no CSC card', async () => {
    const cards = await cardsFor('eparakstsMobile', ['eparakstsMobile', 'eparakstsMobileEseal'], 'en')
    expect(cards.map((c) => c.name)).not.toContain('CSC API')
  })

  it('no card falls back to a raw message key', async () => {
    for (const locale of ['en', 'lv'] as const) {
      const cards = await cardsFor('webEid', ['webEid', 'cscEidPlugin', 'eidScan', 'cscEidScan'], locale)
      for (const c of cards) {
        for (const text of [c.name, c.tag, c.desc]) {
          expect(text).not.toBe('')
          expect(text).not.toMatch(/^signing\./)
        }
      }
    }
  })
})
