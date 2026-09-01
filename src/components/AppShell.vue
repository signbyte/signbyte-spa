<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { setLocale, type Locale } from '@/i18n'
import { Button } from '@/components/ui/button'
import SidebarContent from '@/components/SidebarContent.vue'
import BrandMark from '@/components/BrandMark.vue'
import NavIcon from '@/components/NavIcon.vue'
import { NAV_ITEMS } from '@/lib/nav'

// The drawer ships only to sessions that open it (mobile) — desktop never loads its
// code (or the dialog primitive it pulls in).
const MobileDrawer = defineAsyncComponent(() => import('@/components/MobileDrawer.vue'))

const router = useRouter()
const { t, locale } = useI18n()
const session = useSessionStore()

const nav = NAV_ITEMS

// The drawer mounts on first open so its chunk is fetched on demand, then stays
// mounted (cheap) for subsequent opens.
const drawerOpen = ref(false)
const drawerLoaded = ref(false)
function openDrawer() {
  drawerLoaded.value = true
  drawerOpen.value = true
}

function toggleLocale() {
  setLocale(locale.value === 'en' ? 'lv' : ('en' as Locale))
}

async function signOut() {
  const logoutUrl = await session.logout()
  if (logoutUrl) {
    // Full-page navigation so the Auth Service can clear the federated IdP SSO
    // cookie (a fetch could not); the browser is brought back to the public landing.
    window.location.assign(logoutUrl)

    return
  }
  router.push({ name: 'landing' })
}
</script>

<template>
  <div class="flex min-h-screen bg-paper">
    <!-- Bypass block: a keyboard/AT user jumps straight to the page content. -->
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-btn focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
    >
      {{ t('shell.skipToContent') }}
    </a>

    <!-- Sidebar (dark console) — desktop only; mobile uses the drawer + bottom bar.
         It carries the language + sign-out actions here (the top bar stays search + New). -->
    <aside class="sticky top-0 hidden h-screen w-[250px] shrink-0 lg:flex bg-console text-console-text">
      <SidebarContent show-actions @sign-out="signOut" @toggle-locale="toggleLocale" />
    </aside>

    <!-- Main column -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-line bg-paper/[0.86] px-4 backdrop-blur-[10px] sm:px-5 lg:px-[30px]"
      >
        <!-- Mobile: open the navigation drawer. -->
        <button
          type="button"
          class="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-btn text-ink hover:bg-band lg:hidden"
          :aria-label="t('shell.openMenu')"
          @click="openDrawer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
          </svg>
        </button>

        <!-- Desktop: faux search field (search is not wired for MVP). -->
        <div
          class="hidden h-[38px] w-[300px] items-center gap-2 rounded-[9px] border border-line bg-surface px-3 text-muted lg:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" stroke-linecap="round" />
          </svg>
          <span class="truncate text-[13.5px]">{{ t('shell.search') }}…</span>
        </div>

        <!-- Mobile: centered brand. -->
        <div class="flex flex-1 justify-center lg:hidden">
          <BrandMark tone="ink" :size="22" />
        </div>
        <!-- Desktop: spacer that pushes the action to the right. -->
        <div class="hidden flex-1 lg:block"></div>

        <!-- New signature — full button on desktop, a 36px ink square on mobile. -->
        <Button
          class="hidden rounded-[9px] lg:inline-flex"
          @click="router.push({ name: 'sign-new' })"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          {{ t('nav.newSignature') }}
        </Button>
        <button
          type="button"
          class="grid h-9 w-9 shrink-0 place-items-center rounded-btn bg-ink text-white hover:bg-ink/90 lg:hidden"
          :aria-label="t('nav.newSignature')"
          @click="router.push({ name: 'sign-new' })"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <main
        id="main"
        tabindex="-1"
        class="flex-1 px-4 py-6 pb-24 focus:outline-none sm:px-8 sm:py-8 lg:px-9 lg:pt-[34px] lg:pb-[60px]"
      >
        <slot />
      </main>
    </div>

    <!-- Bottom tab bar — mobile primary navigation (dark console, matching the sidebar). -->
    <nav
      data-testid="bottom-nav"
      class="fixed inset-x-0 bottom-0 z-30 flex border-t border-console-line bg-console pb-[env(safe-area-inset-bottom)] lg:hidden"
      :aria-label="t('shell.primaryNav')"
    >
      <RouterLink
        v-for="item in nav"
        :key="item.name"
        :to="{ name: item.name }"
        class="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-console-muted"
        active-class="!text-white"
      >
        <NavIcon :name="item.icon" :size="20" />
        {{ t(item.label) }}
      </RouterLink>
    </nav>

    <!-- Mobile navigation drawer (loaded on first open). The drawer draws its own brand
         header, so the slotted sidebar hides its logo row (hide-brand). -->
    <MobileDrawer
      v-if="drawerLoaded"
      v-model:open="drawerOpen"
      :title="t('shell.menu')"
      :close-label="t('common.close')"
    >
      <template #header>
        <BrandMark tone="console" />
      </template>
      <SidebarContent
        hide-brand
        show-actions
        @navigate="drawerOpen = false"
        @sign-out="signOut"
        @toggle-locale="toggleLocale"
      />
    </MobileDrawer>
  </div>
</template>
