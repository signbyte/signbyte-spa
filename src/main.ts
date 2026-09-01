import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/main.css'
import App from './App.vue'
import { router } from './router'
import { i18n, setLocale } from './i18n'
import { setUnauthorizedHandler } from './lib/api'
import { useSessionStore } from './stores/session'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(router)

// Keep the document language in sync with the active locale (assistive tech + a11y).
setLocale(i18n.global.locale.value)

// A mid-session 401 ends the session client-side and routes to login (the API
// holds the real tokens; this is only navigation). Public screens are exempt —
// they work without a session, so an expired session there only flips the state.
// (The session probe never fires this at all — see api.probe.)
setUnauthorizedHandler(() => {
  const session = useSessionStore()
  session.$patch({ identity: null, status: 'anonymous' })
  const current = router.currentRoute.value
  if (!current.meta.public && current.name !== 'login') {
    router.push({ name: 'login', query: { redirect: current.fullPath } })
  }
})

app.mount('#app')
