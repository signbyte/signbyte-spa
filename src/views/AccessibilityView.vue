<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="text-2xl font-bold tracking-tight text-ink">{{ t('accessibility.title') }}</h1>
    <p class="mt-4 text-sm leading-relaxed text-ink">{{ t('accessibility.intro') }}</p>
    <p class="mt-3 text-sm leading-relaxed text-muted">{{ t('accessibility.conformance') }}</p>
    <p class="mt-3 text-sm leading-relaxed text-muted">{{ t('accessibility.feedback') }}</p>
    <RouterLink to="/" class="mt-6 inline-block text-sm font-semibold text-ink underline">
      {{ t('notFound.home') }}
    </RouterLink>
  </main>
</template>
