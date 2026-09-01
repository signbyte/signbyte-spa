import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
  type Router,
} from 'vue-router'
import { useSessionStore } from '@/stores/session'

// Every route is session-guarded except the login/callback pair and the public
// information views. `public: true` opts a route out of the guard.
// A pending archive parked across the re-authentication redirect (the document
// hub stashes it before navigating to the consent window). Consumed on read;
// only a fresh stash counts — an abandoned consent must not replay an archive
// minutes later. The value holds a document id and a timestamp, never a
// credential. Storage access is wrapped: a blocked store means no resume, not a
// broken app.
const pendingArchiveKey = 'signbyte.pendingArchive'
const pendingArchiveMaxAgeMs = 10 * 60 * 1000
function takePendingArchive(): string | null {
  try {
    const raw = sessionStorage.getItem(pendingArchiveKey)
    if (!raw) return null
    sessionStorage.removeItem(pendingArchiveKey)
    const parsed = JSON.parse(raw) as { doc?: string; at?: number }
    if (!parsed.doc || !parsed.at || Date.now() - parsed.at > pendingArchiveMaxAgeMs) return null

    return parsed.doc
  } catch {
    return null
  }
}

const routes: RouteRecordRaw[] = [
  {
    // The public marketing landing — the site face. A signed-out visitor hitting
    // the root is sent here (see the guard); an authenticated user reaches it via
    // "Back to site" (it never auto-bounces them to the dashboard).
    path: '/welcome',
    name: 'landing',
    component: () => import('@/views/LandingView.vue'),
    meta: { public: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
    meta: { public: true },
  },
  {
    // The dashboard IS the document library — the signer inbox and the documents
    // list are merged into one screen.
    path: '/',
    name: 'home',
    component: () => import('@/views/DashboardView.vue'),
  },
  {
    // The former Documents path folds into the dashboard; kept as a redirect so existing
    // links (and in-app navigations still targeting it) continue to resolve.
    path: '/documents',
    name: 'documents',
    redirect: { name: 'home' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
  },
  {
    path: '/documents/:id',
    name: 'document-hub',
    component: () => import('@/views/DocumentHubView.vue'),
  },
  {
    path: '/sign/new',
    name: 'sign-new',
    component: () => import('@/views/NewSigningView.vue'),
  },
  {
    // Envelope URLs stay valid but resolve to the document hub — the one screen
    // a document has. The resolver loads the envelope and lands on its document.
    path: '/envelopes/:id',
    name: 'envelope',
    component: () => import('@/views/EnvelopeRedirectView.vue'),
  },
  {
    path: '/envelopes/:id/slots/:slot/sign',
    name: 'sign-slot',
    component: () => import('@/views/SigningView.vue'),
  },
  {
    // The public verify flow: check a signed document without an account. The
    // login screen links here, so an unauthenticated visitor must reach it (the
    // view renders standalone when there's no session, in the app shell when
    // there is one).
    path: '/verify',
    name: 'verify',
    component: () => import('@/views/VerifyView.vue'),
    meta: { public: true },
  },
  {
    path: '/accessibility',
    name: 'accessibility',
    component: () => import('@/views/AccessibilityView.vue'),
    meta: { public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true },
  },
]

export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  const router = createRouter({
    history,
    routes,
    // In-page anchors (the landing's section nav) scroll to their target; every
    // real navigation starts at the top.
    scrollBehavior: (to) => (to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }),
  })

  router.beforeEach(async (to) => {
    const session = useSessionStore()

    // Resolve the session once on first navigation (or after a reset).
    if (session.status === 'unknown') {
      await session.fetchMe()
    }

    if (to.meta.public) {
      // Don't strand an already-authenticated user on the login screen.
      if (to.name === 'login' && session.isAuthenticated) {
        return { name: 'home' }
      }

      return true
    }

    if (!session.isAuthenticated) {
      // A guest at the bare root gets the public landing; a guest following a
      // deep link goes to login, which returns them there afterwards.
      if (to.name === 'home') {
        return { name: 'landing' }
      }

      return { name: 'login', query: { redirect: to.fullPath } }
    }

    // A pending archive parked across the re-authentication redirect: the
    // consent window returned the browser to the app root, so route back to the
    // document and let its screen retry. Fresh stashes only — a stale one (the
    // person wandered off mid-consent) is dropped rather than replayed later.
    const pending = takePendingArchive()
    if (pending && to.name !== 'document-hub') {
      return { name: 'document-hub', params: { id: pending }, query: { resumeArchive: '1' } }
    }

    return true
  })

  return router
}

export const router = createAppRouter()
