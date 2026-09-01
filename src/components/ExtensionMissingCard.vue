<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { WEB_EID_INSTALL_URL } from '@/lib/webeid'

// Shown when the Web eID browser extension / native app isn't found during a card
// login or card signing: an amber alert + a "what you need" checklist + an install
// link + retry / choose-another actions. Shared by the login and signing card flows;
// the host wires the two actions to its own retry / go-back behaviour.
const { t } = useI18n()
defineEmits<{ retry: []; another: [] }>()
</script>

<template>
  <div class="pt-1">
    <div role="alert" class="mb-[18px] flex items-start gap-3 rounded-[13px] border border-amber-line bg-amber-bg p-4">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a5e10" stroke-width="1.7" class="mt-px shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5m0 3h.01" stroke-width="1.9" stroke-linecap="round" />
      </svg>
      <div>
        <p class="text-[16px] font-bold text-amber-fg">{{ t('extMissing.title') }}</p>
        <p class="mt-0.5 text-[13.5px] leading-relaxed text-amber-fg">{{ t('extMissing.body') }}</p>
      </div>
    </div>

    <div class="mb-5 rounded-[13px] border border-line-2 bg-surface p-[18px]">
      <p class="eyebrow text-faint">{{ t('extMissing.needTitle') }}</p>
      <ul class="mt-3 flex flex-col gap-3">
        <li class="flex items-center gap-[11px]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16181b" stroke-width="1.6" class="shrink-0" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 9h18" />
          </svg>
          <span class="text-[14px] text-[#3d4248]">{{ t('extMissing.item1') }}</span>
        </li>
        <li class="flex items-center gap-[11px]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16181b" stroke-width="1.6" class="shrink-0" aria-hidden="true">
            <path d="M9 3v18M4 6h16v12H4z" stroke-linejoin="round" />
          </svg>
          <span class="text-[14px] text-[#3d4248]">{{ t('extMissing.item2') }}</span>
        </li>
        <li class="flex items-center gap-[11px]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16181b" stroke-width="1.6" class="shrink-0" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <rect x="5" y="9" width="7" height="3" rx="1" fill="#16181b" stroke="none" />
          </svg>
          <span class="text-[14px] text-[#3d4248]">{{ t('extMissing.item3') }}</span>
        </li>
      </ul>
      <a
        :href="WEB_EID_INSTALL_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-green-deep hover:underline"
      >
        {{ t('extMissing.install') }}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M7 17L17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
    </div>

    <div class="flex flex-wrap justify-end gap-2.5">
      <Button variant="outline" @click="$emit('another')">{{ t('extMissing.another') }}</Button>
      <Button @click="$emit('retry')">{{ t('extMissing.retry') }}</Button>
    </div>
  </div>
</template>
