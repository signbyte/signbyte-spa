<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// The signbyte logo: a rounded square mark holding a verified-green check, optionally
// followed by the wordmark. `tone` sets the mark fill — a soft line tone reads on the
// dark console (sidebar / drawer), a solid ink tone on light surfaces (mobile top bar,
// the auth lockup). One source for the mark so every surface draws it identically.
withDefaults(defineProps<{ tone?: 'console' | 'ink'; wordmark?: boolean; size?: number }>(), {
  tone: 'console',
  wordmark: true,
  size: 26,
})

const { t } = useI18n()
</script>

<template>
  <span class="flex items-center gap-2">
    <span
      class="grid place-items-center rounded-chip text-green-bright"
      :class="tone === 'ink' ? 'bg-ink' : 'bg-console-line'"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
      <svg
        :width="Math.round(size * 0.58)"
        :height="Math.round(size * 0.58)"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span v-if="wordmark" class="text-[17px] font-bold tracking-tight">{{ t('app.name') }}</span>
  </span>
</template>
