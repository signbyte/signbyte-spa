<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { Button } from '@/components/ui/button'
import DocumentStatusPill from '@/components/DocumentStatusPill.vue'
import { useDashboardStore, type ChainRow } from '@/stores/dashboard'
import type { EnvelopeSummary } from '@/stores/envelopes'
import { ownedEnvelopeBadge, type OwnedBadge } from '@/lib/envelope-status'

// The dashboard IS the document library — one screen, merging what used to be a separate
// Home inbox and Documents list. The portal API composes it in one call and enforces the
// row model server-side: the signer inbox (envelopes a different person invited the user
// to sign), the user's envelopes, and their STANDALONE document chains — each chain
// collapsed to its single live head, and any chain an envelope covers already subtracted.
// So one envelope or chain is always exactly one row. A row click only ever opens the
// item's hub (an envelope's tracking page, or a document's hub view) — it never starts a
// signing and never downloads; those are explicit actions inside the hub.

type Lifecycle = 'draft' | 'awaiting' | 'signing' | 'completed' | 'declined' | 'expired'

interface LibraryRow {
  key: string
  kind: 'chain' | 'envelope'
  refId: string
  title: string
  sub: string
  lifecycle: Lifecycle
  parties: string
  ttl: string
  ttlExpired: boolean
  updated: string
  // The sortable instant behind `updated` (0 when unknown).
  lastAction: number
  note: '' | 'declined' | 'expired'
  // Owned envelopes carry a whose-turn/progress badge derived from the list projection;
  // it drives the status pill in place of the plain lifecycle label when present.
  badge?: OwnedBadge
  // An envelope row's covered document — the row click lands on that document's
  // hub (the one screen), with the envelope pre-resolved.
  docId?: string
}

const { t, locale } = useI18n()
const router = useRouter()
const dash = useDashboardStore()

type Filter = 'all' | 'drafts' | 'awaiting' | 'completed'
const filter = ref<Filter>('all')
const filters: Filter[] = ['all', 'drafts', 'awaiting', 'completed']

onMounted(() => {
  dash.load()
})

function isExpired(c: ChainRow): boolean {
  if (c.status === 'expired') return true
  const until = Date.parse(c.retentionUntil)
  return Number.isFinite(until) && until <= Date.now()
}

function formatDate(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return t('documents.ttl.none')
  // Date + time: repeated actions on the same day must stay tellable apart.
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(ms)
}

// The last-action instant behind a row's "updated" text — what the library
// sorts on (newest action first).
function lastAction(iso?: string): number {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) ? ms : 0
}

// A coarse "time left" for the retention horizon — hours under a day, then days.
function remaining(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  return hours < 24
    ? t('documents.ttl.hours', { n: Math.max(1, hours) })
    : t('documents.ttl.days', { n: Math.floor(hours / 24) })
}

function ttlText(c: ChainRow): string {
  if (isExpired(c)) return t('documents.ttl.expired')
  const ms = Date.parse(c.retentionUntil) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return t('documents.ttl.expired')
  return t('documents.ttl.remaining', { time: remaining(ms) })
}

function orderLabel(policy?: string): string {
  return policy === 'sequential' || policy === 'parallel' ? t(`envelopes.order.${policy}`) : ''
}

// A chain reads as a draft until the FIRST signature made here lands — then its
// signed head replaces the draft row and stays. A file uploaded already signed
// still reads as a draft (it can be validated or co-signed as-is); the workflow
// state is what the row shows, not the file's signature presence.
function chainLifecycle(c: ChainRow): Lifecycle {
  if (isExpired(c)) return 'expired'
  // A signing workflow over the chain is in progress: the honest state is
  // "in signing" — not a draft the viewer could edit/delete, not a completed
  // result they could take away (the download is server-frozen until the
  // workflow's terminal transition).
  if (c.resultFrozen) return 'signing'
  if (c.platformSigned) return 'completed'
  return 'draft'
}

function envLifecycle(status: string): Lifecycle {
  // Expired first: retention closed this envelope, and the fallback below would
  // otherwise dress it as "awaiting" — a workflow waiting on nobody.
  if (/expired/i.test(status)) return 'expired'
  if (/cancelled|declined/i.test(status)) return 'declined'
  if (/completed|signed/i.test(status)) return 'completed'
  if (/draft/i.test(status)) return 'draft'
  return 'awaiting'
}

// The envelope row's time-to-live — the SOONEST of its documents' auto-delete
// instants, stamped by the composed read. An envelope without a known horizon
// states none rather than inventing one.
function envTtl(e: EnvelopeSummary, lifecycle: Lifecycle): { text: string; expired: boolean } {
  if (lifecycle === 'expired') return { text: t('documents.ttl.expired'), expired: true }
  if (!e.retentionUntil) return { text: t('documents.ttl.none'), expired: false }
  const ms = Date.parse(e.retentionUntil) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return { text: t('documents.ttl.expired'), expired: true }
  return { text: t('documents.ttl.remaining', { time: remaining(ms) }), expired: false }
}

// Build the unified row list. Awaiting (invited) first — the most actionable — then the
// user's own envelopes, then their documents.
const rows = computed<LibraryRow[]>(() => {
  const none = t('documents.ttl.none')

  const taskRows: LibraryRow[] = dash.tasks.map((tk) => ({
    key: 'task:' + tk.envelope.id + ':' + tk.slotId,
    kind: 'envelope',
    refId: tk.envelope.id,
    docId: tk.envelope.docIds?.[0],
    title: tk.envelope.title || tk.envelope.id,
    sub: orderLabel(tk.envelope.orderPolicy),
    lifecycle: 'awaiting',
    parties: t('documents.parties.multiple'),
    ttl: none,
    ttlExpired: false,
    updated: none,
    lastAction: 0,
    note: '',
  }))

  const envRows: LibraryRow[] = dash.envelopes.map((e) => {
    const lifecycle = envLifecycle(e.status)
    const ttl = envTtl(e, lifecycle)
    return {
      key: 'env:' + e.id,
      kind: 'envelope' as const,
      refId: e.id,
      docId: e.docIds?.[0],
      title: e.title || e.id,
      sub: orderLabel(e.orderPolicy),
      lifecycle,
      // A one-slot envelope is a self-sign — its only party is the owner.
      parties: t(e.slotCount === 1 ? 'documents.parties.you' : 'documents.parties.multiple'),
      ttl: ttl.text,
      ttlExpired: ttl.expired,
      updated: (e.updatedAt || e.createdAt) ? formatDate(e.updatedAt || e.createdAt || '') : none,
      lastAction: lastAction(e.updatedAt || e.createdAt),
      note:
        lifecycle === 'declined' ? ('declined' as const)
        : lifecycle === 'expired' ? ('expired' as const)
        : ('' as const),
      badge: ownedEnvelopeBadge(e),
    }
  })

  const chainRows: LibraryRow[] = dash.chains.map((c) => {
    const lifecycle = chainLifecycle(c)
    return {
      key: 'chain:' + c.chainRootId,
      kind: 'chain' as const,
      refId: c.id,
      title: c.filename || c.id,
      sub: c.mime,
      lifecycle,
      parties: t('documents.parties.you'),
      ttl: ttlText(c),
      ttlExpired: isExpired(c),
      updated: formatDate(c.updatedAt || c.createdAt),
      lastAction: lastAction(c.updatedAt || c.createdAt),
      note: lifecycle === 'expired' ? ('expired' as const) : ('' as const),
    }
  })

  // Awaiting tasks stay pinned first (the most actionable); everything else
  // orders by LAST ACTION, newest first (ruled 2026-07-21).
  const library = [...envRows, ...chainRows].sort((a, b) => b.lastAction - a.lastAction)
  return [...taskRows, ...library]
})

const filtered = computed(() => {
  if (filter.value === 'all') return rows.value
  if (filter.value === 'drafts') return rows.value.filter((r) => r.lifecycle === 'draft')
  if (filter.value === 'awaiting')
    return rows.value.filter((r) => r.lifecycle === 'awaiting' || r.lifecycle === 'signing')
  return rows.value.filter((r) => r.lifecycle === 'completed')
})

// Stats. Storage = the soonest auto-delete among everything the user still
// holds — standalone chains AND envelope-covered documents (whose retention
// arrives on the envelope row, since the chain row is subtracted).
const statStorage = computed(() => {
  let soonest = Infinity
  for (const c of dash.chains) {
    if (isExpired(c)) continue
    const ms = Date.parse(c.retentionUntil) - Date.now()
    if (Number.isFinite(ms) && ms > 0 && ms < soonest) soonest = ms
  }
  for (const e of dash.envelopes) {
    if (!e.retentionUntil || envLifecycle(e.status) === 'expired') continue
    const ms = Date.parse(e.retentionUntil) - Date.now()
    if (Number.isFinite(ms) && ms > 0 && ms < soonest) soonest = ms
  }
  return Number.isFinite(soonest) ? remaining(soonest) : t('documents.ttl.none')
})

const stats = computed(() => [
  { label: t('documents.stat.documents'), value: String(rows.value.length) },
  { label: t('documents.stat.awaiting'), value: String(dash.tasks.length) },
  { label: t('documents.stat.completed'), value: String(rows.value.filter((r) => r.lifecycle === 'completed').length) },
  { label: t('documents.stat.storage'), value: statStorage.value },
])

function tone(r: LibraryRow): 'green' | 'amber' | 'red' | 'neutral' {
  if (r.badge) return r.badge.tone
  if (r.lifecycle === 'completed') return 'green'
  if (r.lifecycle === 'awaiting' || r.lifecycle === 'signing') return 'amber'
  if (r.lifecycle === 'declined' || r.lifecycle === 'expired') return 'red'
  return 'neutral'
}
function statusLabel(r: LibraryRow): string {
  if (r.badge) return t(r.badge.labelKey, r.badge.params ?? {})
  return t(`documents.status.${r.lifecycle}`)
}

// A row click only ever opens the document's hub — the ONE screen an item has.
// An envelope row lands on its covered document's hub with the envelope
// pre-resolved (falling back to the envelope resolver when the projection
// carried no document id). Signing, downloading, validating — every verb —
// is an explicit action inside the hub, never a row-click side effect.
function clickable(r: LibraryRow): boolean {
  if (r.kind === 'envelope') return true
  return r.lifecycle !== 'expired'
}
function onRowClick(r: LibraryRow): void {
  if (!clickable(r)) return
  if (r.kind === 'envelope') {
    if (r.docId) {
      router.push({ name: 'document-hub', params: { id: r.docId }, query: { env: r.refId } })
    } else {
      router.push({ name: 'envelope', params: { id: r.refId } })
    }
    return
  }
  router.push({ name: 'document-hub', params: { id: r.refId } })
}

const loading = computed(() => dash.state === 'loading')
const errored = computed(() => dash.state === 'error')
const hasRows = computed(() => rows.value.length > 0)
</script>

<template>
  <AppShell>
    <div class="mx-auto max-w-[1080px]">
      <!-- Header. Uploading lives in the signing flow's Upload step, not here. -->
      <div>
        <h1 class="text-title text-ink">{{ t('documents.title') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted">{{ t('documents.subtitle') }}</p>
      </div>

      <!-- Stats row -->
      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="s in stats" :key="s.label" class="rounded-card border border-line bg-surface p-4 shadow-card">
          <p class="eyebrow text-faint">{{ s.label }}</p>
          <p class="mt-2 text-stat text-ink">{{ s.value }}</p>
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="mt-8 flex flex-wrap items-center gap-2" role="group" :aria-label="t('documents.col.status')">
        <button
          v-for="f in filters"
          :key="f"
          type="button"
          :aria-pressed="filter === f"
          class="rounded-[8px] px-[15px] py-[7px] text-[13.5px] font-semibold transition-colors"
          :class="filter === f ? 'bg-ink text-white' : 'text-muted hover:bg-band'"
          @click="filter = f"
        >
          {{ t(`documents.filter.${f}`) }}
        </button>
      </div>

      <!-- States -->
      <section class="mt-4" aria-live="polite">
        <!-- Loading -->
        <div
          v-if="loading"
          class="rounded-card border border-line bg-surface p-10 text-center text-sm text-muted shadow-card"
        >
          {{ t('documents.loading') }}
        </div>

        <!-- Error -->
        <div
          v-else-if="errored"
          class="rounded-card border border-line bg-surface p-10 text-center shadow-card"
          role="alert"
        >
          <p class="text-sm text-red-fg">{{ t(dash.errorKey ?? 'errors.generic') }}</p>
          <div class="mt-4">
            <Button variant="outline" size="sm" @click="dash.load()">{{ t('login.retry') }}</Button>
          </div>
        </div>

        <!-- Empty (nothing in the library at all) -->
        <div
          v-else-if="!hasRows"
          class="rounded-card border border-line bg-surface p-12 text-center shadow-card"
        >
          <span class="mx-auto grid h-[74px] w-[74px] place-items-center rounded-card bg-band text-muted">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M14 3v5h5" stroke-linejoin="round" />
              <path d="M7 3h7l5 5v13H5V5a2 2 0 0 1 2-2z" stroke-linejoin="round" />
            </svg>
          </span>
          <p class="mt-4 text-step text-ink">{{ t('documents.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('documents.empty.body') }}</p>
          <div class="mt-5 flex flex-col items-center gap-3">
            <Button @click="router.push({ name: 'sign-new' })">{{ t('documents.empty.cta') }}</Button>
            <RouterLink :to="{ name: 'verify' }" class="text-[13px] font-medium text-green-deep hover:underline">
              {{ t('documents.empty.verify') }} →
            </RouterLink>
          </div>
        </div>

        <!-- Filtered to empty -->
        <div
          v-else-if="filtered.length === 0"
          class="rounded-card border border-line bg-surface p-10 text-center text-sm text-muted shadow-card"
        >
          {{ t('documents.empty.filtered') }}
        </div>

        <!-- Library -->
        <template v-else>
          <!-- Wide: table. Shown only alongside the desktop shell (the shell goes
               mobile below lg — a squeezed table under mobile chrome reads broken).
               Fixed layout with the design's column proportions, so long values
               (raw media types) truncate instead of forcing a horizontal scroll. -->
          <div class="hidden overflow-x-auto rounded-card border border-line bg-surface shadow-card lg:block">
            <table class="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col class="w-[34%]" />
                <col class="w-[17%]" />
                <col class="w-[21%]" />
                <col class="w-[14%]" />
                <col class="w-[14%]" />
              </colgroup>
              <thead>
                <tr class="border-b border-line">
                  <th scope="col" class="eyebrow whitespace-nowrap px-5 py-3 text-faint">{{ t('documents.col.document') }}</th>
                  <th scope="col" class="eyebrow whitespace-nowrap px-3 py-3 text-faint">{{ t('documents.col.status') }}</th>
                  <th scope="col" class="eyebrow whitespace-nowrap px-3 py-3 text-faint">{{ t('documents.col.parties') }}</th>
                  <th scope="col" class="eyebrow whitespace-nowrap px-3 py-3 text-faint">{{ t('documents.col.ttl') }}</th>
                  <th scope="col" class="eyebrow whitespace-nowrap px-5 py-3 text-faint">{{ t('documents.col.updated') }}</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="r in filtered" :key="r.key">
                  <tr
                    class="border-b border-line-2 last:border-0"
                    :class="clickable(r) ? 'cursor-pointer hover:bg-band' : ''"
                    :tabindex="clickable(r) ? 0 : undefined"
                    :role="clickable(r) ? 'link' : undefined"
                    @click="onRowClick(r)"
                    @keydown.enter="onRowClick(r)"
                  >
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-3">
                        <span class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-chip bg-[#F1EFE9] text-muted">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                            <path d="M14 3v5h5" stroke-linejoin="round" />
                            <path d="M7 3h7l5 5v13H5V5a2 2 0 0 1 2-2z" stroke-linejoin="round" />
                          </svg>
                        </span>
                        <span class="min-w-0">
                          <span class="block truncate font-medium text-ink">{{ r.title }}</span>
                          <span class="block truncate font-mono text-[11px] text-faint">{{ r.sub }}</span>
                        </span>
                      </div>
                    </td>
                    <td class="px-3 py-3"><DocumentStatusPill :tone="tone(r)" :label="statusLabel(r)" /></td>
                    <td class="px-3 py-3 font-mono text-[12px] text-muted-2">{{ r.parties }}</td>
                    <td class="px-3 py-3 font-mono text-[12px]" :class="r.ttlExpired ? 'text-red-fg' : 'text-muted-2'">
                      {{ r.ttl }}
                    </td>
                    <td class="px-5 py-3">
                      <div class="flex items-center justify-between gap-2 font-mono text-[12px] text-muted-2">
                        <span>{{ r.updated }}</span>
                        <svg
                          v-if="clickable(r)"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.8"
                          class="shrink-0 text-faint"
                          aria-hidden="true"
                        >
                          <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </div>
                    </td>
                  </tr>
                  <!-- C2 note: a declined or storage-lapsed reason under the row. -->
                  <tr v-if="r.note">
                    <td colspan="5" class="px-5 pb-3">
                      <p
                        class="rounded-chip px-3 py-2 text-[12px]"
                        :class="r.note === 'expired' ? 'bg-amber-bg text-amber-fg' : 'bg-red-bg text-red-fg'"
                      >
                        {{ t(`documents.note.${r.note}`) }}
                      </p>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Narrow: stacked cards (two-up when there's room, matching the shell's
               mobile range). -->
          <ul class="grid gap-3 sm:grid-cols-2 lg:hidden">
            <li
              v-for="r in filtered"
              :key="r.key"
              class="rounded-card border border-line bg-surface p-4 shadow-card"
              :class="clickable(r) ? 'cursor-pointer' : ''"
              @click="onRowClick(r)"
            >
              <div class="flex items-start gap-3">
                <span class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-chip bg-[#F1EFE9] text-muted">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                    <path d="M14 3v5h5" stroke-linejoin="round" />
                    <path d="M7 3h7l5 5v13H5V5a2 2 0 0 1 2-2z" stroke-linejoin="round" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-ink">{{ r.title }}</p>
                  <p class="truncate font-mono text-[11px] text-faint">{{ r.sub }}</p>
                </div>
                <DocumentStatusPill :tone="tone(r)" :label="statusLabel(r)" />
              </div>
              <dl class="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div>
                  <dt class="eyebrow text-[10px] text-faint">{{ t('documents.col.parties') }}</dt>
                  <dd class="text-muted-2">{{ r.parties }}</dd>
                </div>
                <div>
                  <dt class="eyebrow text-[10px] text-faint">{{ t('documents.col.ttl') }}</dt>
                  <dd :class="r.ttlExpired ? 'text-red-fg' : 'text-muted-2'">{{ r.ttl }}</dd>
                </div>
                <div>
                  <dt class="eyebrow text-[10px] text-faint">{{ t('documents.col.updated') }}</dt>
                  <dd class="text-muted-2">{{ r.updated }}</dd>
                </div>
              </dl>
              <p
                v-if="r.note"
                class="mt-3 rounded-chip px-3 py-2 text-[12px]"
                :class="r.note === 'expired' ? 'bg-amber-bg text-amber-fg' : 'bg-red-bg text-red-fg'"
              >
                {{ t(`documents.note.${r.note}`) }}
              </p>
            </li>
          </ul>

          <!-- Retention note banner. -->
          <p class="mt-4 flex items-center gap-2 rounded-card bg-band px-4 py-3 text-[13.5px] text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="shrink-0 text-green" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke-linecap="round" />
            </svg>
            {{ t('documents.upload.ttlNote') }}
          </p>
        </template>
      </section>
    </div>
  </AppShell>
</template>
