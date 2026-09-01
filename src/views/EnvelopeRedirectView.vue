<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/AppShell.vue'
import { useEnvelopesStore } from '@/stores/envelopes'

// Envelope URLs resolve to the document hub — the one screen a document has.
// This thin resolver keeps every existing /envelopes/{id} link working (old
// bookmarks, in-flight redirect returns): it loads the envelope, takes its
// document, and lands on that document's hub with the envelope pre-resolved.
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const envelopes = useEnvelopesStore()

onMounted(async () => {
  const id = String(route.params.id ?? '')
  try {
    await envelopes.loadDetail(id)
    const doc = envelopes.detail?.documents[0]?.documentId
    if (doc) {
      router.replace({ name: 'document-hub', params: { id: doc }, query: { env: id } })

      return
    }
  } catch {
    /* fall through to home */
  }
  router.replace({ name: 'home' })
})
</script>

<template>
  <AppShell>
    <div class="mx-auto max-w-4xl rounded-card border border-line bg-surface p-10 text-center text-sm text-muted shadow-card">
      {{ t('hub.loading') }}
    </div>
  </AppShell>
</template>
