<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { Button } from '@/components/ui/button'
import BrandMark from '@/components/BrandMark.vue'
import NavIcon from '@/components/NavIcon.vue'
import { NAV_ITEMS } from '@/lib/nav'

// The inner sidebar layout — logo, primary navigation, the ephemeral-storage note,
// and the user chip. The dark console background is supplied by the wrapper (the
// desktop <aside> or the mobile drawer panel), so this stays presentation-only.
// It carries the language + sign-out actions (`showActions`); every interactive
// element emits `navigate` so the mobile drawer can close itself. `hideBrand` drops
// the logo row when the wrapper draws its own brand header (the mobile drawer does).
withDefaults(defineProps<{ showActions?: boolean; hideBrand?: boolean }>(), {
  showActions: false,
  hideBrand: false,
})
const emit = defineEmits<{ navigate: []; signOut: []; toggleLocale: [] }>()

const { t, locale } = useI18n()
const session = useSessionStore()

const initials = computed(() => {
  const name = session.identity?.name?.trim()
  if (!name) return '?'

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
})

const nav = NAV_ITEMS
</script>

<template>
  <div class="flex h-full flex-col px-3.5 pb-[18px]" :class="hideBrand ? 'pt-2' : 'pt-[18px]'">
    <div v-if="!hideBrand" class="pb-3">
      <BrandMark />
    </div>

    <p class="eyebrow pb-2 text-[10px] text-muted-2">
      {{ t('shell.workspace') }}
    </p>

    <nav class="flex flex-col gap-[3px]" :aria-label="t('shell.primaryNav')">
      <RouterLink
        v-for="item in nav"
        :key="item.name"
        :to="{ name: item.name }"
        class="flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-sm font-medium text-console-muted hover:bg-white/[0.07] hover:text-white"
        active-class="bg-white/[0.07] !text-white"
        @click="emit('navigate')"
      >
        <NavIcon :name="item.icon" />
        {{ t(item.label) }}
      </RouterLink>
    </nav>

    <div class="mt-auto flex flex-col gap-3 pt-5">
      <!-- Ephemeral-storage note: a green lock + mono title above the body copy. -->
      <div class="rounded-card border border-console-line bg-console-raised p-3">
        <div class="flex items-center gap-1.5 text-green-bright">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke-linecap="round" />
          </svg>
          <span class="eyebrow text-[10px]">{{ t('shell.storageTitle') }}</span>
        </div>
        <p class="mt-1.5 text-[12px] leading-relaxed text-console-muted">{{ t('shell.storageNote') }}</p>
      </div>

      <!-- User chip — separated from the storage note by a hairline. -->
      <div class="flex items-center gap-3 border-t border-console-line pt-3">
        <span class="grid h-8 w-8 place-items-center rounded-full bg-[#222A30] text-[13px] font-semibold text-green-bright">
          {{ initials }}
        </span>
        <span class="min-w-0">
          <span class="block truncate text-[13.5px] font-semibold text-console-text">{{ session.identity?.name }}</span>
          <span class="block font-mono text-[10.5px] tracking-wide text-green-bright">
            LoA <span class="uppercase">{{ session.identity?.loa }}</span>
          </span>
        </span>
      </div>

      <!-- Language + sign-out — in the sidebar on desktop, in the drawer on mobile. -->
      <div v-if="showActions" class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="text-console-text hover:bg-white/[0.07]"
          :aria-label="t('shell.switchLanguage')"
          @click="emit('toggleLocale')"
        >
          {{ locale === 'en' ? 'LV' : 'EN' }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-console-text hover:bg-white/[0.07]"
          @click="emit('signOut')"
        >
          {{ t('common.signOut') }}
        </Button>
      </div>

      <!-- Leave the authenticated workspace for the public site. -->
      <RouterLink
        :to="{ name: 'landing' }"
        class="flex items-center gap-1.5 text-[13px] text-console-muted transition-colors hover:text-console-text"
        @click="emit('navigate')"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ t('nav.backToSite') }}
      </RouterLink>
    </div>
  </div>
</template>
