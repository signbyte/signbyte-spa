<script setup lang="ts">
// The signing-flow step indicator, in one place so the step context never vanishes
// mid-flow (the design is one continuous stepper across the whole sequence). Dumb and
// presentational: the parent passes the ordered step labels and the active index; this
// renders the mobile "Step N of N" + progress bar and the desktop labelled track. Reused
// by the guided new-signing view and the signing view so they read as one flow.
// pulse adds a soft ring to the active step while a backend job runs under it (the
// completion screen's "in-progress" final step).
defineProps<{ steps: readonly string[]; current: number; label?: string; pulse?: boolean }>()
</script>

<template>
  <div>
    <!-- Mobile: compact "Step N of N" + progress bar. -->
    <div class="sm:hidden">
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-ink">{{ steps[current] }}</p>
        <p class="font-mono text-[12px] text-muted">{{ current + 1 }} / {{ steps.length }}</p>
      </div>
      <div
        class="mt-2 h-1.5 overflow-hidden rounded-pill bg-gray-bg"
        role="progressbar"
        :aria-valuenow="current + 1"
        :aria-valuemin="1"
        :aria-valuemax="steps.length"
        :aria-label="label"
      >
        <div
          class="h-full rounded-pill bg-green transition-all"
          :style="{ width: `${((current + 1) / steps.length) * 100}%` }"
        />
      </div>
    </div>

    <!-- Desktop: numbered mono circles — active (green), done (soft-green), pending (gray). -->
    <ol class="hidden items-center gap-2 sm:flex" :aria-label="label">
      <li v-for="(s, i) in steps" :key="s" class="flex flex-1 items-center gap-2">
        <span
          class="grid h-7 w-7 shrink-0 place-items-center rounded-pill font-mono text-[12px] font-semibold"
          :class="[
            i < current
              ? 'bg-green-soft text-green-deep'
              : i === current
                ? 'bg-green text-white'
                : 'bg-gray-bg text-gray-fg',
            i === current && pulse ? 'step-pulse' : '',
          ]"
          :aria-current="i === current ? 'step' : undefined"
        >
          {{ i + 1 }}
        </span>
        <span class="text-[13px]" :class="i === current ? 'font-semibold text-ink' : 'text-muted'">{{ s }}</span>
        <span v-if="i < steps.length - 1" class="h-px flex-1 bg-line-2" aria-hidden="true" />
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* Soft pulsing ring on the active step while a backend job runs under it. */
.step-pulse {
  animation: step-pulse 1.8s ease-in-out infinite;
}
@keyframes step-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(14, 158, 107, 0);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(14, 158, 107, 0.14);
  }
}
@media (prefers-reduced-motion: reduce) {
  .step-pulse {
    animation: none;
  }
}
</style>
