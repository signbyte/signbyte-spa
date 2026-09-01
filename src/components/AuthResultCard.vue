<script setup lang="ts">
// The shared centered status card the auth screens land on: a "returning" spinner
// state (signing you in / completing the provider round-trip) and a "failed" red
// state (the sign-in did not complete). Both the login screen and the provider
// callback use it, so the two entry points read identically. Any actions
// (Try again / Back) are supplied by the host via the default slot.
defineProps<{ variant: 'returning' | 'failed'; title: string; body: string }>()
</script>

<template>
  <div
    class="rounded-[16px] border bg-surface px-7 py-8 text-center"
    :class="variant === 'failed' ? 'border-[#f2c9c6]' : 'border-line'"
    :role="variant === 'failed' ? 'alert' : 'status'"
    :aria-live="variant === 'failed' ? undefined : 'polite'"
  >
    <span
      v-if="variant === 'returning'"
      class="mx-auto mb-[18px] block h-[46px] w-[46px] animate-spin rounded-full border-[3px] border-[#e3e0d9] border-t-green motion-reduce:animate-none"
      aria-hidden="true"
    />
    <span
      v-else
      class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-bg"
      aria-hidden="true"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a33531" stroke-width="2.2">
        <path d="M7 7l10 10M17 7L7 17" stroke-linecap="round" />
      </svg>
    </span>
    <h2 class="text-[18px] font-bold tracking-tight text-ink">{{ title }}</h2>
    <p class="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{{ body }}</p>
    <div v-if="$slots.default" class="mt-6 flex flex-wrap justify-center gap-3"><slot /></div>
  </div>
</template>
