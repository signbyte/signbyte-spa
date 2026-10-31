import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n'
import { api } from '@/lib/api'
import LoginView from './LoginView.vue'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), get: vi.fn() } }))

async function mountLogin() {
  i18n.global.locale.value = 'en'
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/verify', name: 'verify', component: { template: '<div />' } },
      { path: '/welcome', name: 'landing', component: { template: '<div />' } },
    ],
  })
  await router.push('/login')
  return mount(LoginView, { global: { plugins: [i18n, router] } })
}

describe('LoginView', () => {
  const assign = vi.fn()

  beforeEach(() => {
    vi.mocked(api.post).mockReset()
    vi.mocked(api.post).mockResolvedValue({ authorize_url: 'https://auth.example/authorize' })
    vi.stubGlobal('location', { ...window.location, assign })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    assign.mockReset()
  })

  // Each redirect button asks for its method by the auth service's own name; a
  // provider's code is never sent from here.
  it.each([
    ['eParaksts Mobile', 'eparakstsMobile'],
    ['eID Scan', 'eidScan'],
  ])('%s asks the sign-in for %s', async (label, method) => {
    const w = await mountLogin()

    await w.get(`button[aria-label="${label}"]`).trigger('click')
    await flushPromises()

    expect(api.post).toHaveBeenCalledWith('/login/start', { acr_values: method })
    expect(assign).toHaveBeenCalledWith('https://auth.example/authorize')
  })
})
