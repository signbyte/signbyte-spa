<script setup lang="ts">
// The validating visual, as one reusable element: a context line, the signature
// stage under a scanning sweep, the status copy, a pulsing working dot, and an
// indeterminate progress bar. Purely presentational — the host decides when it
// shows, what the copy says, and what chrome wraps it (the public verify screen
// puts it in its waiting card; the document hub centers it over the preview; the
// signing completion hosts both its waiting phases here, slotting its self-drawing
// artwork in for the sealing phase). It carries no verdict cue on purpose: while
// it is visible the outcome is open.
//
// Slots: `context` replaces the default mono context line (e.g. an eyebrow);
// `art` replaces the staged artwork inside the SVG (default: the fully-drawn
// signature + seal). Slotted content is styled by the host's own scope.
withDefaults(
  defineProps<{
    /** The mono context line above the stage — a filename or document title. */
    context?: string
    /** The stage's small uppercase caption (e.g. "Validating signature · EU DSS"). */
    caption: string
    title: string
    body: string
    /** The uppercase working label beside the pulsing dot (e.g. "Validating…"). */
    label: string
    /** The scanning sweep — on while something is being checked (default). */
    scan?: boolean
  }>(),
  { context: '', scan: true },
)

// The staged signature artwork — the strokes the signing completion draws.
const MAIN_PATH =
  'M 26 98 C 30 50 42 38 50 44 C 58 50 54 80 44 96 C 56 92 66 70 76 66 C 84 63 88 70 84 82 C 81 91 78 96 84 96 C 92 96 104 76 116 64 C 124 56 130 62 126 76 C 123 86 118 95 124 97 C 132 99 146 78 160 64 C 170 54 178 60 174 76 C 171 87 166 95 172 98 C 182 102 198 80 214 62 C 226 49 238 56 232 74 C 228 86 220 96 226 99 C 236 103 252 82 270 62'
const UNDER_PATH =
  'M 56 116 C 130 132 244 132 326 114 C 356 107 366 120 346 128 C 337 132 326 130 320 125'
</script>

<template>
  <div class="text-center" role="status" aria-live="polite" data-testid="validating-card">
    <div class="mb-5 flex justify-center">
      <slot name="context">
        <span class="max-w-full truncate font-mono text-[12.5px] text-muted-2">{{ context }}</span>
      </slot>
    </div>

    <!-- Signature stage under the scan sweep. -->
    <div
      class="relative overflow-hidden rounded-[14px] border border-line-2 bg-band px-[22px] pb-[10px] pt-4 text-left"
      aria-hidden="true"
    >
      <span class="relative z-[2] eyebrow text-[10px] tracking-[0.16em] text-faint">{{ caption }}</span>

      <div v-if="scan" class="scan-bar"></div>

      <svg viewBox="0 0 420 150" class="relative z-[2] mt-0.5 block h-auto w-full">
        <line x1="30" y1="124" x2="392" y2="124" stroke="#E2DFD8" stroke-width="1.5" stroke-dasharray="2 5" stroke-linecap="round" />
        <text x="30" y="140" font-family="JetBrains Mono, monospace" font-size="9" letter-spacing="2" fill="#C2BEB5">SIGNATURE</text>
        <slot name="art">
          <g class="settle-in">
            <path :d="MAIN_PATH" fill="none" stroke="#0E9E6B" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
            <path :d="UNDER_PATH" fill="none" stroke="#0E9E6B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            <g transform="translate(372 84)">
              <circle r="17" fill="#0E9E6B" />
              <path d="M -7 0 L -2 6 L 8 -7" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </g>
          </g>
        </slot>
      </svg>
    </div>

    <p class="mb-1.5 mt-[22px] text-center text-base font-semibold text-ink">{{ title }}</p>
    <p class="mb-[22px] text-center text-sm leading-relaxed text-muted">{{ body }}</p>

    <!-- Pulsing dot + working label. -->
    <div class="mb-3.5 flex items-center justify-center gap-2.5">
      <span class="relative inline-flex h-[9px] w-[9px] items-center justify-center" aria-hidden="true">
        <span class="wait-ping absolute h-[9px] w-[9px] rounded-pill bg-green" />
        <span class="wait-dot h-[9px] w-[9px] rounded-pill bg-green" />
      </span>
      <span class="eyebrow tracking-[0.08em] text-muted">{{ label }}</span>
    </div>
    <!-- Sweeping progress bar (indeterminate). -->
    <div class="mx-auto h-[3px] max-w-[320px] overflow-hidden rounded-pill bg-line-2">
      <div class="bar-sweep h-full w-[36%] rounded-pill" />
    </div>
  </div>
</template>

<style scoped>
/* The scanning sweep + the waiting pulse and bar, scoped to this element. */
.scan-bar {
  position: absolute;
  inset: 0 auto 0 -16%;
  width: 46px;
  background: linear-gradient(90deg, transparent, rgba(14, 158, 107, 0.2), transparent);
  pointer-events: none;
  z-index: 1;
  animation: scan-sweep 1.9s linear infinite;
}
.wait-ping {
  animation: wait-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.wait-dot {
  animation: wait-dot 1.6s ease-in-out infinite;
}
.bar-sweep {
  background: linear-gradient(90deg, transparent, #0e9e6b, transparent);
  animation: bar-sweep 1.8s ease-in-out infinite;
}
/* The default artwork settles in softly (matters when a host flips from its own
   slotted stage — the signing completion's mid-draw snap — to this one). */
.settle-in {
  animation: settle-in 0.18s ease-out;
}
@keyframes scan-sweep {
  0% {
    left: -16%;
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    left: 110%;
    opacity: 0;
  }
}
@keyframes wait-ping {
  0% {
    transform: scale(1);
    opacity: 0.85;
  }
  70%,
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}
@keyframes wait-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
@keyframes bar-sweep {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(280%);
  }
}
@keyframes settle-in {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 1;
  }
}

/* Honor reduced motion: no sweep/pulse; the text + status carry the meaning. */
@media (prefers-reduced-motion: reduce) {
  .wait-ping,
  .wait-dot,
  .bar-sweep,
  .settle-in {
    animation: none;
  }
  .scan-bar {
    display: none;
  }
}
</style>
