<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BrandMark from '@/components/BrandMark.vue'

// The public marketing landing — the site face a signed-out visitor sees at the
// root. Purely presentational: every action routes into the app ("Start signing"
// enters through login and lands on the dashboard afterwards — an already-signed-in
// visitor is bounced straight there by the guard) or to the public verify screen.
// It targets login (not the dashboard route directly) because a guest navigating
// to the dashboard would be sent back to this landing by the guard's home rule. The validation panel and the legal-meaning card are
// illustrative demo content, not live data.
const { t } = useI18n()

// The signing methods strip. `soon` marks methods the platform doesn't offer yet —
// shown as announced capability, styled apart so nothing reads as available today.
const METHODS: { key: string; soon?: boolean }[] = [
  { key: 'eparakstsMobile' },
  { key: 'eidCard' },
  { key: 'eidScan' },
  { key: 'cloudEseal' },
  { key: 'csc', soon: true },
  { key: 'eudi', soon: true },
]

// The lifecycle stages. `soon` renders the announced-capability chip on the title;
// Preserve carries it inline in its body copy instead (timestamps exist today,
// long-term preservation doesn't).
const STAGES: { key: string; soon?: boolean; bodySoon?: boolean }[] = [
  { key: 'sign' },
  { key: 'validate' },
  { key: 'preserve', bodySoon: true },
  { key: 'deliver', soon: true },
]

const PILLARS = ['inclusive', 'qualified', 'agnostic', 'private', 'transparent', 'platform']

// Stage icons, drawn inline like every other glyph in the app (no icon library).
const STAGE_ICONS: Record<string, string> = {
  sign: 'M16.5 3.5l4 4L8 20l-4.5.5L4 16 16.5 3.5z',
  deliver: 'M3.5 11.5L20 4l-6 16-3.5-7-7-1.5z',
}
</script>

<template>
  <div class="min-h-screen bg-paper text-ink">
    <!-- Site header: brand, section anchors, verify + the single start CTA. -->
    <header
      class="sticky top-0 z-50 border-b border-line bg-[rgba(244,243,239,.82)] backdrop-blur-[14px]"
    >
      <div class="mx-auto flex max-w-[1180px] items-center gap-[34px] px-6 py-[15px] sm:px-8">
        <div class="flex items-center gap-2.5">
          <BrandMark tone="ink" :wordmark="false" />
          <span class="text-[18px] font-bold tracking-[-0.01em]">{{ t('app.name') }}</span>
        </div>
        <nav
          class="hidden gap-[26px] text-[14.5px] font-medium text-muted-2 md:flex"
          :aria-label="t('landing.nav.label')"
        >
          <a href="#lifecycle" class="transition-colors hover:text-ink">{{ t('landing.nav.product') }}</a>
          <a href="#trust" class="transition-colors hover:text-ink">{{ t('landing.nav.trust') }}</a>
          <a href="#compliance" class="transition-colors hover:text-ink">{{ t('landing.nav.compliance') }}</a>
        </nav>
        <div class="ml-auto flex items-center gap-2.5">
          <RouterLink
            :to="{ name: 'verify' }"
            class="hidden rounded-[9px] border border-[#dbd8d1] px-3.5 py-[9px] text-[14.5px] font-semibold text-ink transition-colors hover:border-ink sm:inline-block"
          >
            {{ t('landing.verify') }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'login', query: { redirect: '/' } }"
            class="rounded-[9px] bg-ink px-[17px] py-2.5 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {{ t('landing.start') }}
          </RouterLink>
        </div>
      </div>
    </header>

    <main>
      <!-- Hero: the claim, the two entries, and a product-true validation panel. -->
      <section
        class="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-center gap-14 px-6 pb-[52px] pt-[52px] sm:px-8 sm:pt-[78px]"
      >
        <div>
          <div class="eyebrow mb-5 text-[11.5px] font-semibold tracking-[.16em] text-green-deep">
            {{ t('landing.hero.eyebrow') }}
          </div>
          <h1
            class="mb-[22px] text-balance text-[clamp(36px,6.5vw,55px)] font-bold leading-[1.04] tracking-[-0.032em]"
          >
            {{ t('landing.hero.title') }}
          </h1>
          <p class="mb-8 max-w-[520px] text-[18.5px] leading-[1.55] text-[#565b61]">
            <i18n-t keypath="landing.hero.lead">
              <template #loa>
                <strong class="font-semibold text-ink">LoA&nbsp;High</strong>
              </template>
            </i18n-t>
          </p>
          <div class="mb-7 flex flex-wrap gap-3">
            <RouterLink
              :to="{ name: 'login', query: { redirect: '/' } }"
              class="rounded-[11px] bg-ink px-6 py-[15px] text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {{ t('landing.start') }}
            </RouterLink>
            <RouterLink
              :to="{ name: 'verify' }"
              class="rounded-[11px] border border-[#d6d3cc] px-[23px] py-3.5 text-[16px] font-semibold text-ink transition-colors hover:border-ink"
            >
              {{ t('landing.verify') }}
            </RouterLink>
          </div>
          <div class="flex flex-wrap gap-x-[18px] gap-y-2 font-mono text-[12px] tracking-[.02em] text-[#7a7f85]">
            <span>QES · LT profile</span><span class="text-[#cfccc4]" aria-hidden="true">/</span>
            <span>eIDAS</span><span class="text-[#cfccc4]" aria-hidden="true">/</span>
            <span>GDPR</span><span class="text-[#cfccc4]" aria-hidden="true">/</span>
            <span>NIS2</span><span class="text-[#cfccc4]" aria-hidden="true">/</span>
            <span>WCAG 2.1 AA</span>
          </div>
        </div>

        <!-- Demo validation panel (illustration only — mirrors the report screen). -->
        <div
          class="rounded-[18px] bg-console p-[7px] shadow-console-deep ring-1 ring-console-line"
          aria-hidden="true"
        >
          <div class="flex items-center gap-[7px] px-3.5 pb-[13px] pt-[11px]">
            <span class="h-[9px] w-[9px] rounded-full bg-[#3a4248]"></span>
            <span class="h-[9px] w-[9px] rounded-full bg-[#3a4248]"></span>
            <span class="h-[9px] w-[9px] rounded-full bg-[#3a4248]"></span>
            <span class="ml-2 font-mono text-[11px] text-[#6b7278]">validation · EU DSS</span>
          </div>
          <div class="rounded-[13px] bg-console-raised p-5 text-console-text">
            <div class="mb-[18px] flex items-center justify-between gap-3">
              <div class="truncate font-mono text-[12.5px] text-[#b9c0c5]">Lease-Agreement-2026.asice</div>
              <div
                class="inline-flex shrink-0 items-center gap-[7px] rounded-pill bg-[rgba(43,209,140,.12)] px-[11px] py-[5px] font-mono text-[12px] font-semibold text-green-bright"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12.5l4 4 10-11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                TOTAL-PASSED
              </div>
            </div>
            <div class="flex items-center gap-3 border-b border-[#232a30] pb-4">
              <div class="grid h-[38px] w-[38px] place-items-center rounded-full bg-[#222a30] text-[14px] font-semibold text-green-bright">
                JB
              </div>
              <div>
                <div class="text-[15px] font-semibold">Jānis Bērziņš</div>
                <div class="text-[12.5px] text-console-muted">{{ t('landing.mock.qes') }}</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-x-5 gap-y-[15px] pt-4 font-mono">
              <div v-for="f in ['format', 'signed', 'container', 'validUntil']" :key="f">
                <div class="mb-1 text-[10.5px] uppercase tracking-[.08em] text-[#6b7278]">
                  {{ t(`landing.mock.${f}`) }}
                </div>
                <div class="text-[12.5px] text-[#d6dadd]">
                  {{ { format: 'PAdES-BASELINE-LT', signed: '2026-06-18 09:42', container: 'ASiC-E · 2 files', validUntil: '2031-06-17' }[f] }}
                </div>
              </div>
            </div>
            <div class="mt-4 overflow-hidden text-ellipsis whitespace-nowrap rounded-[9px] bg-console px-[13px] py-[11px] font-mono text-[11px] text-[#6b7278]">
              sha-256 · 9f2a:c4e1:7b08:dd35:a1f0:6c92:e4b7…
            </div>
          </div>
        </div>
      </section>

      <!-- Signing methods strip. -->
      <section class="border-y border-line bg-band">
        <div class="mx-auto flex max-w-[1180px] flex-wrap items-center gap-[30px] px-6 py-[30px] sm:px-8">
          <div class="eyebrow text-[11px] tracking-[.14em] text-faint">{{ t('landing.methods.label') }}</div>
          <div class="flex flex-wrap gap-2.5">
            <span
              v-for="m in METHODS"
              :key="m.key"
              class="rounded-[8px] px-[13px] py-[7px] text-[13.5px] font-medium"
              :class="m.soon ? 'border border-dashed border-[#cfccc4] text-faint' : 'border border-[#e4e1da] bg-surface text-[#3d4248]'"
            >
              {{ t(`landing.methods.${m.key}`) }}<template v-if="m.soon"> · {{ t('landing.soon') }}</template>
            </span>
          </div>
        </div>
      </section>

      <!-- The trust lifecycle: what the platform covers, stage by stage. -->
      <section id="lifecycle" class="mx-auto max-w-[1180px] scroll-mt-16 px-6 py-16 sm:px-8 sm:py-[92px]">
        <div class="eyebrow mb-3.5 text-[11.5px] font-semibold tracking-[.16em] text-green-deep">
          {{ t('landing.lifecycle.eyebrow') }}
        </div>
        <h2 class="mb-3.5 max-w-[640px] text-balance text-section">{{ t('landing.lifecycle.title') }}</h2>
        <p class="mb-11 max-w-[560px] text-[17px] leading-normal text-[#565b61]">
          {{ t('landing.lifecycle.lead') }}
        </p>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[18px]">
          <div
            v-for="(s, i) in STAGES"
            :key="s.key"
            class="rounded-card border border-[#eae7e0] bg-surface p-6"
          >
            <div class="mb-[18px] font-mono text-[12px] font-semibold text-green-deep">0{{ i + 1 }}</div>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" class="mb-3.5" aria-hidden="true">
              <template v-if="s.key === 'validate'">
                <circle cx="12" cy="12" r="9" stroke="#16181b" stroke-width="1.6" />
                <path d="M8 12l3 3 5-6" stroke="#16181b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </template>
              <template v-else-if="s.key === 'preserve'">
                <path d="M4 7h16M5 7v12a1 1 0 001 1h12a1 1 0 001-1V7M9 11h6" stroke="#16181b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M3 4h18v3H3z" stroke="#16181b" stroke-width="1.6" stroke-linejoin="round" />
              </template>
              <path v-else :d="STAGE_ICONS[s.key]" stroke="#16181b" stroke-width="1.6" stroke-linejoin="round" />
            </svg>
            <div class="mb-1.5 text-[17px] font-semibold">
              {{ t(`landing.lifecycle.${s.key}.title`) }}
              <span
                v-if="s.soon"
                class="ml-1.5 inline-block rounded-chip border border-dashed border-[#cfccc4] px-[9px] py-0.5 align-[2px] text-[11px] font-medium text-faint"
              >
                {{ t('landing.soon') }}
              </span>
            </div>
            <div class="text-[14px] leading-normal text-muted">
              {{ t(`landing.lifecycle.${s.key}.body`) }}
              <span
                v-if="s.bodySoon"
                class="ml-1 inline-block rounded-chip border border-dashed border-[#cfccc4] px-[9px] py-0.5 align-[1px] text-[11px] font-medium text-faint"
              >
                {{ t('landing.soon') }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Why this platform: the six pillars. -->
      <section class="border-y border-line bg-band">
        <div class="mx-auto max-w-[1180px] px-6 py-16 sm:px-8 sm:py-[88px]">
          <div class="eyebrow mb-3.5 text-[11.5px] font-semibold tracking-[.16em] text-green-deep">
            {{ t('landing.pillars.eyebrow', { brand: t('app.name') }) }}
          </div>
          <h2 class="mb-11 max-w-[560px] text-balance text-section">{{ t('landing.pillars.title') }}</h2>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(270px,1fr))] gap-[18px]">
            <div
              v-for="p in PILLARS"
              :key="p"
              class="rounded-card border border-[#eae7e0] bg-surface p-[26px]"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="mb-4" stroke="#0a7a52" stroke-width="1.6" aria-hidden="true">
                <template v-if="p === 'inclusive'">
                  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke-linejoin="round" />
                </template>
                <template v-else-if="p === 'qualified'">
                  <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" stroke-linejoin="round" />
                  <path d="M8.5 12l2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
                </template>
                <template v-else-if="p === 'agnostic'">
                  <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" />
                  <path d="M8 7.5l8 9M16 7.5l-8 9" />
                </template>
                <template v-else-if="p === 'private'">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </template>
                <template v-else-if="p === 'transparent'">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke-linejoin="round" />
                  <circle cx="12" cy="12" r="3" />
                </template>
                <template v-else>
                  <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
                </template>
              </svg>
              <div class="mb-[7px] text-[17px] font-semibold">{{ t(`landing.pillars.${p}.title`) }}</div>
              <div class="text-[14px] leading-[1.55] text-muted">{{ t(`landing.pillars.${p}.body`) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Trust transparency: what-you-see-is-what-you-sign, on the dark console. -->
      <section id="trust" class="scroll-mt-16 bg-console text-console-text">
        <div
          class="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-center gap-14 px-6 py-16 sm:px-8 sm:py-[92px]"
        >
          <div>
            <div class="eyebrow mb-4 text-[11.5px] font-semibold tracking-[.16em] text-green-bright">
              {{ t('landing.trust.eyebrow') }}
            </div>
            <h2 class="mb-[18px] text-balance text-[clamp(30px,4vw,36px)] font-bold leading-[1.12] tracking-[-0.025em] text-[#f4f3ef]">
              {{ t('landing.trust.title') }}
            </h2>
            <p class="mb-[26px] text-[16.5px] leading-relaxed text-[#9ba3a9]">{{ t('landing.trust.lead') }}</p>
            <div class="flex flex-col gap-3.5">
              <div v-for="b in ['surfaced', 'reveal', 'public']" :key="b" class="flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="mt-0.5 flex-none" aria-hidden="true">
                  <path d="M5 12.5l4 4 10-11" stroke="#2bd18c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-[15px] leading-normal text-[#c8cdd1]">{{ t(`landing.trust.${b}`) }}</span>
              </div>
            </div>
          </div>

          <!-- Demo legal-meaning card (illustration only). -->
          <div class="rounded-2xl border border-[#232a30] bg-console-raised p-6" aria-hidden="true">
            <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[.1em] text-[#6b7278]">
              {{ t('landing.trust.legalLabel') }}
            </div>
            <p class="mb-5 text-[15.5px] leading-relaxed text-[#d6dadd]">
              <i18n-t keypath="landing.trust.legalBody">
                <template #qes>
                  <strong class="font-semibold text-green-bright">{{ t('landing.trust.legalQes') }}</strong>
                </template>
                <template #date>
                  <span class="font-mono text-white">2031-06-17</span>
                </template>
              </i18n-t>
            </p>
            <div class="grid grid-cols-2 gap-3.5 border-t border-[#232a30] pt-4 font-mono">
              <div v-for="f in ['jurisdiction', 'assurance', 'warnings', 'errors']" :key="f">
                <div class="mb-1 text-[10px] uppercase tracking-[.08em] text-[#6b7278]">
                  {{ t(`landing.trust.${f}`) }}
                </div>
                <div class="text-[13px]" :class="f === 'warnings' || f === 'errors' ? 'text-green-bright' : 'text-[#d6dadd]'">
                  {{ { jurisdiction: 'EU · eIDAS', assurance: 'LoA High', warnings: '0', errors: '0' }[f] }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Compliance band. -->
      <section id="compliance" class="scroll-mt-16 border-b border-line bg-band">
        <div
          class="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-10 gap-y-3.5 px-6 py-10 font-mono text-[13px] tracking-[.03em] text-muted-2 sm:px-8"
        >
          <span class="font-semibold text-ink">eIDAS</span><span class="text-[#cfccc4]" aria-hidden="true">·</span>
          <span class="font-semibold text-ink">GDPR</span><span class="text-[#cfccc4]" aria-hidden="true">·</span>
          <span class="font-semibold text-ink">NIS2</span><span class="text-[#cfccc4]" aria-hidden="true">·</span>
          <span>WCAG 2.1 AA</span><span class="text-[#cfccc4]" aria-hidden="true">·</span>
          <span>{{ t('landing.compliance.residency') }}</span><span class="text-[#cfccc4]" aria-hidden="true">·</span>
          <span>EN / LV</span>
        </div>
      </section>

      <!-- Final call to action. -->
      <section class="mx-auto max-w-[1180px] px-6 py-20 text-center sm:px-8 sm:py-24">
        <h2 class="mx-auto mb-[18px] max-w-[640px] text-balance text-[clamp(32px,5vw,44px)] font-bold leading-[1.08] tracking-[-0.03em]">
          {{ t('landing.cta.title') }}
        </h2>
        <p class="mx-auto mb-[30px] max-w-[480px] text-[18px] text-[#565b61]">{{ t('landing.cta.lead') }}</p>
        <RouterLink
          :to="{ name: 'login', query: { redirect: '/' } }"
          class="inline-block rounded-[12px] bg-ink px-[30px] py-4 text-[16.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {{ t('landing.start') }}
        </RouterLink>
      </section>
    </main>

    <footer class="bg-console text-console-muted">
      <div class="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-8 px-6 pb-10 pt-[54px] sm:px-8">
        <div>
          <div class="mb-3.5 flex items-center gap-2.5 text-[#f4f3ef]">
            <BrandMark tone="console" />
          </div>
          <div class="max-w-[260px] text-[13.5px] leading-[1.55]">{{ t('landing.footer.blurb') }}</div>
        </div>
        <div>
          <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[.1em] text-[#5a6166]">
            {{ t('landing.footer.product') }}
          </div>
          <div class="flex flex-col gap-2.5 text-[14px]">
            <span v-for="s in STAGES" :key="s.key">{{ t(`landing.lifecycle.${s.key}.title`) }}</span>
          </div>
        </div>
        <div>
          <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[.1em] text-[#5a6166]">
            {{ t('landing.footer.trust') }}
          </div>
          <div class="flex flex-col gap-2.5 text-[14px]">
            <span>eIDAS</span>
            <span>GDPR</span>
            <span>NIS2</span>
            <RouterLink :to="{ name: 'accessibility' }" class="transition-colors hover:text-console-text">
              {{ t('landing.footer.accessibility') }}
            </RouterLink>
          </div>
        </div>
        <div>
          <div class="mb-3.5 font-mono text-[11px] uppercase tracking-[.1em] text-[#5a6166]">
            {{ t('landing.footer.developers') }}
          </div>
          <div class="flex flex-col gap-2.5 text-[14px]">
            <span>Integration API</span>
            <span>Webhooks</span>
            <span>{{ t('landing.footer.embeddable') }}</span>
            <span>EUDI Wallet</span>
          </div>
        </div>
      </div>
      <div class="border-t border-console-line">
        <div
          class="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-2.5 px-6 py-5 font-mono text-[12.5px] text-[#5a6166] sm:px-8"
        >
          <span>{{ t('landing.footer.copyright') }}</span>
          <span>{{ t('landing.footer.crypto') }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>
