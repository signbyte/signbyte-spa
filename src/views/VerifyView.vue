<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/AppShell.vue'
import BrandMark from '@/components/BrandMark.vue'
import VerifyPanel from '@/components/VerifyPanel.vue'
import { useSessionStore } from '@/stores/session'

// The public Verify tab: anyone may check a signed document, account or not.
// Two presentations, mirroring the other public screens: inside the
// authenticated shell for in-app nav, and a standalone page for visitors who
// arrive without a session (the login screen's "Verify a document · no account
// needed" links here). The panel itself is identical — the endpoint is public.
const { t } = useI18n()
const session = useSessionStore()
</script>

<template>
  <AppShell v-if="session.isAuthenticated">
    <VerifyPanel />
  </AppShell>

  <main v-else class="min-h-screen bg-paper px-6 py-12">
    <div class="mx-auto max-w-2xl">
      <div class="mb-8 flex items-center justify-between">
        <BrandMark :size="34" tone="ink" />
        <RouterLink :to="{ name: 'landing' }" class="text-[13px] text-faint transition-colors hover:text-ink">
          ← {{ t('nav.backToSite') }}
        </RouterLink>
      </div>
      <VerifyPanel />
    </div>
  </main>
</template>
