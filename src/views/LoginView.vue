<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import BrandMark from '@/components/BrandMark.vue'
import AuthResultCard from '@/components/AuthResultCard.vue'

// The login methods the portal offers, in the design's order (mobile app · card ·
// scan). Each hands the browser to the auth service (the API returns where to send
// it), asking for the method by its id, which is the auth service's own name for it.
// The auth service reads the card on its own sign-in page and sends the browser on
// to the national eID provider for the others. The user never types a password or
// code here.
interface Method {
  id: 'eparakstsMobile' | 'eidScan' | 'webEid'
}

const METHODS: Method[] = [{ id: 'eparakstsMobile' }, { id: 'webEid' }, { id: 'eidScan' }]

// Where to land after login; only a same-origin path is honoured.
const POST_LOGIN_KEY = 'signbyte.postLogin'

const { t } = useI18n()
const route = useRoute()

// The screen has three stages in one route: the method picker, a "signing you in"
// spinner while the browser is sent on, and a generic failed card.
const stage = ref<'select' | 'returning' | 'failed'>('select')
const pickedMethod = ref('')

function intendedRoute(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/'
}

async function start(method: Method) {
  pickedMethod.value = t(`login.method.${method.id}`)
  stage.value = 'returning'
  try {
    // Stash the intended route (a non-secret path) so the callback can restore it
    // after the round-trip, then send the browser to the auth service.
    sessionStorage.setItem(POST_LOGIN_KEY, intendedRoute())
    const { authorize_url } = await api.post<{ authorize_url: string }>('/login/start', {
      acr_values: method.id,
    })
    window.location.assign(authorize_url)
  } catch (err) {
    stage.value = 'failed'
    console.warn('login failed', err)
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-paper px-6 py-12">
    <div class="w-full max-w-[430px]">
      <!-- Select: the method picker -->
      <template v-if="stage === 'select'">
        <div class="mb-[26px] text-center">
          <div class="mb-4 flex justify-center">
            <BrandMark :size="44" :wordmark="false" tone="ink" />
          </div>
          <h1 class="text-[25px] font-bold tracking-[-0.02em] text-ink">
            {{ t('login.title', { brand: t('app.name') }) }}
          </h1>
          <p class="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">
            {{ t('login.subtitle') }}
          </p>
        </div>

        <div role="group" :aria-label="t('login.title', { brand: t('app.name') })" class="flex flex-col gap-2.5">
          <button
            v-for="m in METHODS"
            :key="m.id"
            type="button"
            :aria-label="t(`login.method.${m.id}`)"
            class="flex items-center gap-3.5 rounded-[13px] border border-line bg-surface p-4 text-left transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            @click="start(m)"
          >
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#f1efe9]" aria-hidden="true">
              <svg
                v-if="m.id === 'eparakstsMobile'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16181b"
                stroke-width="1.7"
              >
                <rect x="6" y="2" width="12" height="20" rx="3" />
                <path d="M10 18h4" stroke-linecap="round" />
              </svg>
              <svg
                v-else-if="m.id === 'webEid'"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16181b"
                stroke-width="1.7"
              >
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="M7 14h5M15 11h2" stroke-linecap="round" />
              </svg>
              <svg
                v-else
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16181b"
                stroke-width="1.7"
              >
                <path
                  d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2M4 12h16"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold text-ink">{{ t(`login.method.${m.id}`) }}</span>
              <span class="mt-px block text-[13px] text-faint">{{ t(`login.methodDesc.${m.id}`) }}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9c6bf" stroke-width="1.8" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        <div class="mt-4 flex items-center gap-2.5 rounded-[11px] border border-line-2 bg-band px-3.5 py-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0a7a52" stroke-width="1.6" class="shrink-0" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5V6l7-3z" stroke-linejoin="round" />
          </svg>
          <span class="text-[12.5px] leading-snug text-muted-2">{{ t('login.loaNote') }}</span>
        </div>

        <p class="mt-5 text-center text-[13.5px] text-muted">
          <RouterLink :to="{ name: 'verify' }" class="font-semibold text-green-deep hover:underline">
            {{ t('login.verifyCta') }}
          </RouterLink>
          · {{ t('login.verifyNote') }}
        </p>

        <p class="mt-3.5 text-center">
          <RouterLink :to="{ name: 'landing' }" class="text-[13px] text-faint transition-colors hover:text-muted">
            ← {{ t('nav.backToSite') }}
          </RouterLink>
        </p>
      </template>

      <!-- Returning: signing you in -->
      <AuthResultCard
        v-else-if="stage === 'returning'"
        variant="returning"
        :title="t('login.signingIn')"
        :body="t('login.returning.body', { method: pickedMethod })"
      />

      <!-- Failed: sign-in didn't complete -->
      <AuthResultCard
        v-else
        variant="failed"
        :title="t('login.failedTitle')"
        :body="t('login.failedBody')"
      >
        <Button @click="stage = 'select'">{{ t('login.retry') }}</Button>
      </AuthResultCard>
    </div>
  </main>
</template>
