<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/AppShell.vue'
import { Button } from '@/components/ui/button'
import DocumentStatusPill from '@/components/DocumentStatusPill.vue'
import { useHistoryStore, type HistoryRow } from '@/stores/history'

// History — what left the dashboard. Terminal chains whose storage the platform
// destroyed (files gone; nothing can be downloaded, signed, or re-validated)
// stay listed here as metadata records for a bounded keep window, then are
// erased. Need proof? The platform's audit records are the durable evidence,
// and a file you still hold can be checked on Verify.
const { t, locale } = useI18n()
const history = useHistoryStore()

// Keyset pager: a stack of page cursors — push to go older, pop to come back.
const cursors = ref<string[]>([])
const confirming = ref<string | null>(null)

onMounted(() => {
  history.load()
})

const canOlder = computed(() => history.rows.length === history.pageSize)
const canNewer = computed(() => cursors.value.length > 0)

function older() {
  const last = history.rows[history.rows.length - 1]
  if (!last) return
  cursors.value.push(last.chainRootId)
  history.load(last.chainRootId)
}

function newer() {
  cursors.value.pop()
  const prev = cursors.value[cursors.value.length - 1] ?? ''
  history.load(prev)
}

function formatDate(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(ms)
}

// The record's outcome: signed here → Completed; arrived/stayed unsigned →
// Expired; erased by the user's own delete → Removed.
function outcome(r: HistoryRow): { tone: 'green' | 'neutral'; label: string } {
  if (r.platformSigned) return { tone: 'green', label: t('history.outcome.completed') }
  if (r.status === 'deleted') return { tone: 'neutral', label: t('history.outcome.removed') }
  return { tone: 'neutral', label: t('history.outcome.expired') }
}

function sub(r: HistoryRow): string {
  const parts: string[] = []
  if (r.platformSigned) parts.push(t('history.sub.signed'))
  else if (r.hasSignatures) parts.push(t('history.sub.arrivedSigned'))
  if (r.mime) parts.push(r.mime)
  return parts.join(' · ')
}

async function remove(r: HistoryRow) {
  if (confirming.value !== r.chainRootId) {
    confirming.value = r.chainRootId
    return
  }
  confirming.value = null
  try {
    await history.remove(r.chainRootId)
  } catch {
    /* the record stays listed; a retry is safe */
  }
}
</script>

<template>
  <AppShell>
    <div class="mx-auto max-w-4xl">
      <div class="min-w-0">
        <p class="font-mono text-[11.5px] uppercase tracking-[0.12em] text-green-deep">
          {{ t('history.eyebrow') }}
        </p>
        <h1 class="mt-1 text-title text-ink">{{ t('history.title') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted">{{ t('history.subtitle') }}</p>
      </div>

      <!-- Loading -->
      <div
        v-if="history.state === 'loading'"
        class="mt-6 rounded-card border border-line bg-surface p-10 text-center text-sm text-muted shadow-card"
      >
        {{ t('history.loading') }}
      </div>

      <!-- Error -->
      <div
        v-else-if="history.state === 'error'"
        class="mt-6 rounded-card border border-line bg-surface p-10 text-center shadow-card"
        role="alert"
      >
        <p class="text-sm text-red-fg">{{ t(history.errorKey ?? 'errors.generic') }}</p>
        <div class="mt-4">
          <Button variant="outline" size="sm" @click="history.load()">{{ t('login.retry') }}</Button>
        </div>
      </div>

      <!-- Empty -->
      <div
        v-else-if="history.state === 'empty' && !canNewer"
        class="mt-6 rounded-card border border-line bg-surface p-12 text-center shadow-card"
      >
        <p class="text-step text-ink">{{ t('history.empty.title') }}</p>
        <p class="mt-1 text-sm text-muted">{{ t('history.empty.body') }}</p>
      </div>

      <!-- Records -->
      <div v-else class="mt-6 rounded-card border border-line bg-surface shadow-card">
        <!-- Wide: the table. Shown only alongside the desktop shell — the shell goes
             mobile below lg, and a squeezed table under mobile chrome is what made
             this screen unreadable: the destroyed date wrapped to three lines, the
             outcome pill clipped, and the remove button fell off the right edge. -->
        <div class="hidden overflow-x-auto lg:block">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" class="eyebrow px-5 py-3 text-faint">{{ t('history.col.document') }}</th>
                <th scope="col" class="eyebrow px-5 py-3 text-faint">{{ t('history.col.outcome') }}</th>
                <th scope="col" class="eyebrow px-5 py-3 text-faint">{{ t('history.col.destroyed') }}</th>
                <th scope="col" class="px-2 py-3"><span class="sr-only">{{ t('history.remove') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in history.rows" :key="r.chainRootId" class="border-t border-line-2">
                <td class="px-5 py-3.5">
                  <span class="block truncate text-sm font-semibold text-ink">{{ r.filename || r.id }}</span>
                  <span v-if="sub(r)" class="mt-0.5 block font-mono text-[10.5px] text-faint">{{ sub(r) }}</span>
                </td>
                <td class="px-5 py-3.5">
                  <DocumentStatusPill :tone="outcome(r).tone" :label="outcome(r).label" />
                </td>
                <td class="px-5 py-3.5 font-mono text-[12px] text-muted-2">{{ formatDate(r.destroyedAt) }}</td>
                <td class="px-2 py-3.5 text-right">
                  <button
                    type="button"
                    class="rounded-chip border px-2 py-1 text-[12px]"
                    :class="confirming === r.chainRootId
                      ? 'border-red-fg/40 bg-red-bg font-semibold text-red-fg'
                      : 'border-transparent text-faint hover:border-line hover:text-red-fg'"
                    :aria-label="t('history.remove')"
                    @click="remove(r)"
                    @blur="confirming = null"
                  >
                    {{ confirming === r.chainRootId ? t('history.removeConfirm') : '✕' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Narrow: one stacked block per record, inside the same card and divided by
             the same hairline the table rows use — so the pager and the note below
             still belong to it. Each record carries what the row carried: name and
             sub, the outcome, when the storage was destroyed, and remove. -->
        <ul class="lg:hidden">
          <li
            v-for="r in history.rows"
            :key="r.chainRootId"
            class="border-t border-line-2 p-4 first:border-t-0"
          >
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-ink">{{ r.filename || r.id }}</span>
                <span v-if="sub(r)" class="mt-0.5 block font-mono text-[10.5px] text-faint">{{ sub(r) }}</span>
              </div>
              <DocumentStatusPill :tone="outcome(r).tone" :label="outcome(r).label" class="shrink-0" />
            </div>
            <div class="mt-3 flex items-end justify-between gap-3">
              <div class="min-w-0">
                <p class="eyebrow text-[10px] text-faint">{{ t('history.col.destroyed') }}</p>
                <p class="font-mono text-[12px] text-muted-2">{{ formatDate(r.destroyedAt) }}</p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-chip border px-2.5 py-1 text-[12px]"
                :class="confirming === r.chainRootId
                  ? 'border-red-fg/40 bg-red-bg font-semibold text-red-fg'
                  : 'border-line text-faint hover:text-red-fg'"
                :aria-label="t('history.remove')"
                @click="remove(r)"
                @blur="confirming = null"
              >
                {{ confirming === r.chainRootId ? t('history.removeConfirm') : t('history.remove') }}
              </button>
            </div>
          </li>
        </ul>

        <!-- Keyset pager -->
        <div
          v-if="canOlder || canNewer"
          class="flex items-center justify-between border-t border-line-2 px-5 py-3"
        >
          <Button variant="outline" size="sm" :disabled="!canNewer" @click="newer">
            ‹ {{ t('history.newer') }}
          </Button>
          <Button variant="outline" size="sm" :disabled="!canOlder" @click="older">
            {{ t('history.older') }} ›
          </Button>
        </div>

        <p class="border-t border-line-2 px-5 py-3 text-[12px] text-muted">{{ t('history.note') }}</p>
      </div>

      <p class="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
        {{ t('hub.audit') }}
      </p>
    </div>
  </AppShell>
</template>
