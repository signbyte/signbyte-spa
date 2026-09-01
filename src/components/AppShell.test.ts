import { describe, it, expect, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { i18n } from '@/i18n'
import AppShell from './AppShell.vue'
import { NAV_ITEMS } from '@/lib/nav'

// A bare router whose route names match the shell's nav targets — enough for the
// RouterLink stubs and useRouter() to resolve, with no session guard / network.
function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      ...NAV_ITEMS.map((n) => ({ path: `/${n.name}`, name: n.name, component: { template: '<div />' } })),
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
}

async function mountShell() {
  const router = testRouter()
  router.push('/home')
  await router.isReady()

  return mount(AppShell, {
    global: {
      plugins: [i18n, createPinia()],
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('AppShell', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('exposes a skip-to-content link targeting the main landmark', async () => {
    const w = await mountShell()
    const skip = w.get('a[href="#main"]')
    expect(skip.text()).toBe('Skip to main content')

    const main = w.get('main')
    expect(main.attributes('id')).toBe('main')
    expect(main.attributes('tabindex')).toBe('-1')
  })

  it('renders a mobile bottom tab bar with every primary nav item', async () => {
    const w = await mountShell()
    const bottom = w.get('[data-testid="bottom-nav"]')
    expect(bottom.findAllComponents(RouterLinkStub)).toHaveLength(NAV_ITEMS.length)
  })

  it('provides a labelled hamburger trigger but does not mount the drawer until opened', async () => {
    const w = await mountShell()
    // The trigger is present...
    expect(w.find('button[aria-label="Open menu"]').exists()).toBe(true)
    // ...but the drawer (and its close control) is lazy — absent before first open.
    expect(w.find('[aria-label="Close"]').exists()).toBe(false)
  })
})
