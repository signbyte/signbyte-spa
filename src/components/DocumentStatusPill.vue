<script setup lang="ts">
// The document lifecycle pill — colour plus a dot and a label, never colour alone.
// Shared by the dashboard table and the mobile cards so both stay in lockstep.
// amber = awaiting signature; green = signed/completed; red = declined/expired;
// neutral = draft.
defineProps<{ tone: 'green' | 'amber' | 'red' | 'neutral'; label: string }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium"
    :class="{
      'bg-green-soft text-green-deep': tone === 'green',
      'bg-amber-bg text-amber-fg': tone === 'amber',
      'bg-red-bg text-red-fg': tone === 'red',
      'bg-gray-bg text-gray-fg': tone === 'neutral',
    }"
  >
    <span
      class="h-1.5 w-1.5 rounded-pill"
      :class="{
        'bg-green': tone === 'green',
        'bg-amber': tone === 'amber',
        'bg-red': tone === 'red',
        'bg-gray-dot': tone === 'neutral',
      }"
      aria-hidden="true"
    />
    {{ label }}
  </span>
</template>
