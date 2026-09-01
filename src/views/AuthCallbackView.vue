<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { Button } from '@/components/ui/button'
import AuthResultCard from '@/components/AuthResultCard.vue'

// The browser lands here after the provider redirect. The API has already redeemed
// the code and set the session cookie (the SPA never sees the code/token). We only
// confirm the session and route on. The redirect target is validated to be a local
// path so an attacker-supplied value can never bounce the user off-site.
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const failed = ref(false)
const message = ref('')

const POST_LOGIN_KEY = 'signbyte.postLogin'

function safeRedirect(): string {
  // The intended route is stashed before the provider round-trip (a non-secret path).
  const stashed = sessionStorage.getItem(POST_LOGIN_KEY)
  sessionStorage.removeItem(POST_LOGIN_KEY)
  const candidate = (typeof route.query.redirect === 'string' && route.query.redirect) || stashed
  // Only same-origin absolute paths; never a full URL or protocol-relative target.
  if (typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate
  }
  return '/'
}

onMounted(async () => {
  // The BFF redirects here with ?error=… when the login did not complete (e.g. the
  // user cancelled or denied access at the provider). Show friendly guidance and
  // don't attempt to load a session.
  const err = typeof route.query.error === 'string' ? route.query.error : ''
  if (err) {
    message.value =
      err === 'cancelled' ? t('callback.cancelled')
      : err === 'idp_error' ? t('callback.idpError')
      : t('callback.failed')
    failed.value = true

    return
  }

  const ok = await session.fetchMe()
  if (ok) {
    router.replace(safeRedirect())
  } else {
    message.value = t('callback.failed')
    failed.value = true
  }
})
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-paper px-6 py-12">
    <div class="w-full max-w-[430px]">
      <!-- Completing: the same "signing you in" spinner card the login screen uses. -->
      <AuthResultCard
        v-if="!failed"
        variant="returning"
        :title="t('callback.completing')"
        :body="t('callback.completingBody')"
      />

      <!-- Failed: the round-trip returned without a session. -->
      <AuthResultCard
        v-else
        variant="failed"
        :title="t('login.failedTitle')"
        :body="message || t('callback.failed')"
      >
        <Button @click="router.replace({ name: 'login' })">{{ t('login.retry') }}</Button>
      </AuthResultCard>
    </div>
  </main>
</template>
