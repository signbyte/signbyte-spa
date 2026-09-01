<script setup lang="ts">
// The document/envelope activity trail — a vertical thread of what has happened
// to this item, rendered from data the portal already holds (never a claim it
// can't back). Tones carry meaning: gray = lifecycle step, green = a trust
// event (a signature, a detected existing signature), amber = waiting on
// someone, seal = the terminal "all done" state, red = a refusal/cancellation.
// This is a user-facing summary, not the evidence record — the platform's audit
// regimes are the durable proof.
export interface TrailEvent {
  key: string
  title: string
  sub?: string
  tone: 'gray' | 'green' | 'amber' | 'seal' | 'red'
}

defineProps<{ label: string; events: TrailEvent[] }>()
</script>

<template>
  <div class="rounded-card border border-line bg-surface p-5">
    <div class="flex items-center justify-between gap-3">
      <p class="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">{{ label }}</p>
      <!-- Optional header controls (e.g. the hub's fold/unfold toggle). -->
      <slot name="actions" />
    </div>
    <ol class="mt-4 list-none p-0">
      <li
        v-for="(ev, i) in events"
        :key="ev.key"
        class="relative flex gap-3.5"
        :class="i < events.length - 1 ? 'pb-4' : ''"
      >
        <!-- Connector thread (not after the last event). -->
        <span
          v-if="i < events.length - 1"
          class="absolute bottom-0 left-2.5 top-6 w-0.5 -translate-x-1/2 bg-line-2"
          aria-hidden="true"
        />
        <span
          class="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill"
          :class="{
            'bg-gray-bg': ev.tone === 'gray',
            'bg-green-soft text-green-deep': ev.tone === 'green',
            'bg-amber-bg': ev.tone === 'amber',
            'bg-green text-white ring-[3px] ring-green-soft': ev.tone === 'seal',
            'bg-red-bg text-red-fg': ev.tone === 'red',
          }"
          aria-hidden="true"
        >
          <svg
            v-if="ev.tone === 'green' || ev.tone === 'seal'"
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          >
            <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg
            v-else-if="ev.tone === 'red'"
            width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          >
            <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
          </svg>
          <span
            v-else
            class="h-1.5 w-1.5 rounded-pill"
            :class="ev.tone === 'amber' ? 'bg-amber' : 'bg-gray-dot'"
          />
        </span>
        <span class="min-w-0">
          <span class="block text-[13.5px] font-semibold text-ink">{{ ev.title }}</span>
          <span v-if="ev.sub" class="mt-0.5 block break-words font-mono text-[11px] tracking-[0.02em] text-muted">
            {{ ev.sub }}
          </span>
        </span>
      </li>
    </ol>
  </div>
</template>
