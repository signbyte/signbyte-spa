<script setup lang="ts">
// The primary-navigation line icons, in one place so the desktop sidebar, the mobile
// drawer, and the bottom tab bar all draw the same glyph from a single source.
defineProps<{ name: 'grid' | 'doc' | 'pen' | 'plus' | 'shield' | 'envelope'; size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 17"
    :height="size ?? 17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    aria-hidden="true"
  >
    <template v-if="name === 'grid'">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </template>
    <template v-else-if="name === 'doc'">
      <path d="M14 3v5h5" stroke-linejoin="round" />
      <path d="M7 3h7l5 5v13H5V5a2 2 0 0 1 2-2z" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'pen'">
      <path d="M12 20h9" stroke-linecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'envelope'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 5 8-5" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" stroke-linejoin="round" />
      <path d="M9 11.5l2 2 4-4.5" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>
