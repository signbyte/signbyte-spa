<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-paper px-4">
    <section class="max-w-md text-center">
      <p class="font-mono text-[12px] uppercase tracking-[0.16em] text-muted">404</p>
      <h1 class="mt-2 text-2xl font-bold tracking-tight text-ink">{{ t('notFound.title') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('notFound.body') }}</p>
      <RouterLink
        to="/"
        class="mt-5 inline-block rounded-btn bg-ink px-4 py-2 text-sm font-semibold text-white"
      >
        {{ t('notFound.home') }}
      </RouterLink>
    </section>
  </main>
</template>
