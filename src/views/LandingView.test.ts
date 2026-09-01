import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { i18n } from '@/i18n'
import LandingView from './LandingView.vue'

function mountLanding() {
  return mount(LandingView, {
    global: {
      plugins: [i18n],
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

// Route names the stubbed links point at (`to` is typed string | location object).
function linkTargets(w: ReturnType<typeof mountLanding>): (string | undefined)[] {
  return w.findAllComponents(RouterLinkStub).map((l) => {
    const to: string | { name?: string } = l.props().to
    return typeof to === 'string' ? to : to.name
  })
}

describe('LandingView', () => {
  it('renders the hero claim with both entry actions', () => {
    const w = mountLanding()

    expect(w.get('h1').text()).toContain('Sign, validate & preserve')

    // "Start signing" enters through login and lands on the dashboard afterwards
    // (the guard would bounce a guest navigating straight to the dashboard back
    // to this landing, so the CTA targets login with a post-auth redirect to '/').
    const targets = linkTargets(w)
    expect(targets).toContain('login')
    expect(targets).toContain('verify')
  })

  it('offers no sign-in nav action — start signing is the single entry', () => {
    const w = mountLanding()
    // The ruling is "no separate Sign-in nav item"; the single "Start signing" CTA
    // routing through login does not reintroduce one.
    expect(w.text()).not.toContain('Sign in to')
    expect(w.text()).not.toContain('landing.signIn')
  })

  it('marks announced-but-unavailable methods apart from live ones', () => {
    const w = mountLanding()
    const chips = w.findAll('section')[1].findAll('span[class*="border"]')
    const soon = chips.filter((c) => c.text().includes('soon'))

    expect(soon.map((c) => c.text())).toEqual([
      'CSC remote signing · soon',
      'EUDI Wallet · soon',
    ])
  })

  it('marks delivery and long-term preservation as upcoming, timestamps as available', () => {
    const w = mountLanding()
    const cards = w.find('#lifecycle').findAll('.rounded-card')

    expect(cards).toHaveLength(4)
    expect(cards[0].text()).not.toContain('soon') // Sign
    expect(cards[1].text()).not.toContain('soon') // Validate
    expect(cards[2].text()).toContain('Archive timestamps today')
    expect(cards[2].text()).toContain('soon') // long-term preservation
    expect(cards[3].text()).toContain('soon') // QERDS delivery
  })

  it('has in-page anchors for the section nav', () => {
    const w = mountLanding()

    for (const id of ['lifecycle', 'trust', 'compliance']) {
      expect(w.find(`a[href="#${id}"]`).exists()).toBe(true)
      expect(w.find(`#${id}`).exists()).toBe(true)
    }
  })

  it('states the crypto posture in the footer', () => {
    const w = mountLanding()
    expect(w.get('footer').text()).toContain('externalised to QTSPs via EU DSS')
  })
})
