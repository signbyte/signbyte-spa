import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '@/lib/api'

// The signed-in user as the portal API reports it. The signing flows the user may
// use are dictated by how they logged in (permittedFlows) — the UI offers only these.
export interface Identity {
  sub: string
  name: string
  loa: string
  loginMethod: string
  permittedFlows: string[]
  // Seal availability, captured at login. Three-valued: true (holds seals —
  // `seals` feeds the picker), false (verifiably none — hide the e-seal
  // method), null (unknown — the login read no catalog; offer the method and
  // let the signing flow resolve it, exactly as before capture existed).
  canEseal: boolean | null
  seals: Seal[]
}

// One organisation seal the user may apply: the id the signing request selects
// it by, and the display name (the seal certificate's CN).
export interface Seal {
  id: string
  label: string
}

interface MeResponse {
  sub: string
  name: string
  loa: string
  login_method: string
  permitted_flows: string[]
  can_eseal?: boolean
  seals?: Seal[]
}

type Status = 'unknown' | 'loading' | 'authenticated' | 'anonymous'

export const useSessionStore = defineStore('session', () => {
  const identity = ref<Identity | null>(null)
  const status = ref<Status>('unknown')

  const isAuthenticated = computed(() => status.value === 'authenticated')
  const permittedFlows = computed(() => identity.value?.permittedFlows ?? [])

  // Resolve the current session against the API. Drives the route guard: a valid
  // /me means authenticated, anything else means anonymous (no token is involved).
  async function fetchMe(): Promise<boolean> {
    status.value = 'loading'
    try {
      // A probe: its 401 is the normal "no session" answer and must not bounce
      // a public screen (the landing, verify) to login.
      const me = await api.probe<MeResponse>('/me')
      identity.value = {
        sub: me.sub,
        name: me.name,
        loa: me.loa,
        loginMethod: me.login_method,
        permittedFlows: me.permitted_flows ?? [],
        canEseal: me.can_eseal ?? null,
        seals: me.seals ?? [],
      }
      status.value = 'authenticated'

      return true
    } catch (err) {
      identity.value = null
      status.value = 'anonymous'
      // A 401 is the expected "no session" answer; anything else is still anonymous
      // for routing, but worth surfacing in dev.
      if (!(err instanceof ApiError) || err.status !== 401) {
        console.warn('session check failed', err)
      }

      return false
    }
  }

  // Log out. Returns a front-channel logout URL when the login was federated
  // (eParaksts): the caller must navigate the browser there so the IdP SSO cookie
  // is cleared — otherwise the next login is silently answered from the lingering
  // IdP session and the user cannot switch identity/method. Null for a
  // non-federated login (the caller routes to the login screen directly).
  async function logout(): Promise<string | null> {
    let logoutUrl: string | null = null
    try {
      const res = await api.post<{ ok: boolean; logoutUrl?: string }>('/logout')
      logoutUrl = res?.logoutUrl ?? null
    } finally {
      identity.value = null
      status.value = 'anonymous'
    }

    return logoutUrl
  }

  // Re-authenticate within the session (the step-up flow, usually with the
  // same method). Returns the authorization URL the caller must navigate the
  // browser to; completing it updates the session in place — including
  // re-capturing the signing capabilities — and returns the browser to the app.
  async function stepUp(method: string): Promise<string | null> {
    const res = await api.post<{ authorize_url?: string }>('/step-up', { method })

    return res?.authorize_url ?? null
  }

  return { identity, status, isAuthenticated, permittedFlows, fetchMe, logout, stepUp }
})
