<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppShell from '@/components/AppShell.vue'
import { Button } from '@/components/ui/button'
import SigningStepper from '@/components/SigningStepper.vue'
import DocumentPreview from '@/components/DocumentPreview.vue'
import OrderableList from '@/components/OrderableList.vue'
import { useDocumentsStore } from '@/stores/documents'
import { ApiError } from '@/lib/api'
import { useEnvelopesStore, type SlotDraft } from '@/stores/envelopes'
import { useSessionStore } from '@/stores/session'
import { isPdf } from '@/lib/sigFormat'

// The guided new-signing flow: add one or more documents, review them, set
// recipients, then commit. Every signing is an envelope — a self-sign builds and
// sends a one-slot envelope (your own slot) and hands off straight into its
// signing screen; adding a co-signer builds a multi-signer envelope that ends at
// Send. Two or more files are always signed together as ONE ASiC-E container —
// the platform bundles them at the commit point, and the order set here IS the
// container's inner-file order.
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const docs = useDocumentsStore()
const envelopes = useEnvelopesStore()
const session = useSessionStore()

type Step = 'document' | 'review' | 'recipients' | 'send'
const steps: Step[] = ['document', 'review', 'recipients', 'send']
const step = ref<Step>('document')
const stepIndex = computed(() => steps.indexOf(step.value))

// A staged file as the wizard shows it. Fresh uploads (and a lone PDF) are loose
// `source` rows (sourceId); once the set is bundled they become inner files of the
// container (innerName). The wizard reconciles the backend to the container-ness
// predicate on every staging change: 2+ files, or a single non-PDF, become ONE
// unsigned ASiC-E the moment they are staged — so an abandoned wizard leaves one
// bundle row, never a pile of loose drafts.
interface Staged {
  key: string
  name: string
  mime: string
  size: number
  sourceId?: string
  innerName?: string
}
const staged = ref<Staged[]>([])
const selectedDocs = computed(() => staged.value) // the ordered staged list the UI renders
// What the upload step lists: a locked signed container shows as itself — one sealed
// .asice row — not its unpacked contents (those belong to Review).
const listedDocs = computed(() =>
  containerLocked.value && adoptedMeta.value ? [adoptedMeta.value] : selectedDocs.value,
)
const selectedDoc = computed(() => staged.value[0] ?? null)
const containerId = ref('') // the materialized unsigned bundle ('' = none: empty, or a lone loose PDF)
const containerName = ref('') // that container's OWN filename, kept alongside its id
// What to call the thing being signed. With a container it is the container's own
// filename: `staged` holds the files INSIDE it, so the first of those names an
// enclosed file, not the document. Only a lone loose PDF is itself the staged item.
const signedThingName = computed(() => containerName.value || selectedDoc.value?.name)
const busy = ref(false) // a bundle/rebundle is in flight — staging controls are disabled
const activeKey = ref('') // the staged item currently shown in Review
const multiDoc = computed(() => staged.value.length >= 2)
// The lone-PDF loose case: a single PDF not (yet) in a container. Its wrap choice is
// applied at signing begin (native PAdES vs ASiC-E), exactly as today — a lone PDF is
// not eager-bundled (that, and the container→loose dissolve, are deferred).
const lonePdf = computed(
  () => staged.value.length === 1 && !containerId.value && isPdf(staged.value[0].mime),
)

function innerToStaged(f: { name: string; mediaType?: string; size?: number }): Staged {
  return { key: f.name, name: f.name, mime: f.mediaType ?? '', size: f.size ?? 0, innerName: f.name }
}

// Arriving with ?doc= stages an EXISTING draft and enters at Review, without
// reconciling — opening a draft never mutates its identity. An unsigned bundle
// stages as the container (its inner files); a single loose source stages as loose
// (it signs / wraps at begin, as today). An unknown id falls through to upload.
onMounted(async () => {
  const docParam = typeof route.query.doc === 'string' ? route.query.doc : ''
  if (!docParam) return
  try {
    const meta = await docs.get(docParam)
    if (meta.innerFiles && meta.innerFiles.length > 0) {
      containerId.value = meta.id
      containerName.value = meta.filename
      staged.value = meta.innerFiles.map(innerToStaged)
      // A SIGNED container entered from its hub behaves exactly like an adopted
      // one: contents immutable, a new file converts the draft to a fresh outer
      // container carrying it as an annex.
      if (meta.status === 'signed') {
        containerLocked.value = true
        hadSignedUpload.value = true
        adoptedMeta.value = { key: meta.id, name: meta.filename, mime: meta.mime, size: meta.size ?? 0 }
      }
    } else {
      staged.value = [
        { key: meta.id, name: meta.filename, mime: meta.mime, size: meta.size ?? 0, sourceId: meta.id },
      ]
    }
    activeKey.value = staged.value[0]?.key ?? ''
    step.value = 'review'
  } catch {
    /* unknown id → fall through to the upload step */
  }
})

// The container-format control. A single PDF gets the real choice: OFF (default)
// signs it natively as PAdES; ON wraps it in an ASiC-E container. Any other single
// type is always a container (control hidden — no choice). Two or more files FORCE
// the container: PAdES cannot bundle, so the switch renders ON and disabled with the
// explanation.
const wrapInContainer = ref(false)
const showFormatToggle = computed(() => multiDoc.value || lonePdf.value)
const wrapForced = computed(() => multiDoc.value)
const wrapOn = computed(() => wrapForced.value || wrapInContainer.value)

// --- Upload + eager bundle: each staged file is a real document; the set is bundled
// into one unsigned ASiC-E as soon as it is a container (2+ files, or a single
// non-PDF), and rebundled on every draft edit. ---
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploading = ref(false)
// The upload-failure message key: '' = no error; otherwise a suffix under
// newSigning.document.err.* mapped from the API's typed rejection.
const uploadErrorKey = ref('')
// Whether any file staged this session already carried a signature (structural
// detection only, not verified) — surfaced so the user knows before signing again.
const hadSignedUpload = ref(false)
// The staged container is an uploaded, already-signed ASiC-E adopted as-is. Its
// CONTENTS are immutable — inner files can't be removed or reordered, and a
// co-signature appends to it as it stands. Adding a new file does not mutate it:
// it CONVERTS the draft — a new container is built with the signed one riding
// inside as an annex data object (its own signatures stay intact inside it).
const containerLocked = ref(false)
// The adopted container's own row (filename / type / size). While the container is
// locked, the upload step lists THIS — the user staged one sealed artifact and that
// is the thing being signed; its contents unpack at Review.
const adoptedMeta = ref<Staged | null>(null)

// Maps an upload failure to a stable i18n key — never the raw body. The codes
// are the platform's typed upload-gate rejections.
function uploadFailureKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'err:document:malformedUpload') return 'malformed'
    if (err.code === 'err:document:infectedUpload') return 'infected'
    if (err.code === 'err:document:fileTooLarge' || err.status === 413) return 'tooLarge'
  }
  return 'generic'
}
const stagedHasSignatures = computed(() => hadSignedUpload.value)

// Reconcile the backend to the container-ness predicate for the current staged set:
// materialize (bundle) or update (rebundle) the container, or leave a lone PDF loose.
// Once a container exists it stays one (a reduced set stays a 1-file container — the
// container→loose dissolve is deferred), so removal/reorder are always a rebundle.
async function reconcile(): Promise<boolean> {
  const items = staged.value
  const n = items.length
  if (n === 0) return true
  const wantContainer = containerId.value ? true : n >= 2 || (n === 1 && !isPdf(items[0].mime))
  if (!wantContainer) return true // a lone PDF stays a loose source (its wrap choice rides begin)
  busy.value = true
  try {
    if (!containerId.value) {
      const b = await docs.bundle(items.map((s) => s.sourceId as string))
      containerId.value = b.id
      containerName.value = b.filename
      staged.value = b.innerFiles.map(innerToStaged)
    } else {
      const entries = items.map((s) => (s.innerName ? { name: s.innerName } : { sourceId: s.sourceId }))
      const b = await docs.rebundle(containerId.value, entries)
      containerName.value = b.filename
      staged.value = b.innerFiles.map(innerToStaged)
    }
    if (activeKey.value && !staged.value.some((s) => s.key === activeKey.value)) {
      activeKey.value = staged.value[0]?.key ?? ''
    }
    return true
  } catch {
    return false
  } finally {
    busy.value = false
  }
}

// Un-stage + delete a set of fresh uploads (best-effort — a failed delete leaves a
// TTL-reaped draft, never data loss).
async function dropFresh(items: Staged[]) {
  const keys = new Set(items.map((f) => f.key))
  staged.value = staged.value.filter((s) => !keys.has(s.key))
  if (activeKey.value && !staged.value.some((s) => s.key === activeKey.value)) {
    activeKey.value = staged.value[0]?.key ?? ''
  }
  for (const f of items) {
    if (f.sourceId) {
      try {
        await docs.remove(f.sourceId)
      } catch {
        /* best-effort */
      }
    }
  }
}

// A refused set is cleaned SURGICALLY: only the offending fresh uploads (an
// unsigned container is the one input that can never join a bundle — it is a
// draft, not a file) are removed and named; the legal files stay staged and the
// commit is retried once over the survivors. Only if that still fails does the
// whole fresh batch come out.
async function recoverRefusedSet(
  fresh: Staged[],
  retry: (survivors: Staged[]) => Promise<boolean>,
): Promise<void> {
  const offenders: Staged[] = []
  for (const f of fresh) {
    try {
      const meta = await docs.get(f.key)
      if (meta.innerFiles && meta.innerFiles.length > 0 && meta.status !== 'signed') offenders.push(f)
    } catch {
      /* unreadable meta — leave it for the fallback */
    }
  }
  if (offenders.length > 0) {
    await dropFresh(offenders)
    cannotBundleName.value = offenders.map((o) => o.name).join(', ')
    uploadErrorKey.value = 'cannotBundleFile'
    const survivors = fresh.filter((f) => !offenders.includes(f))
    if (survivors.length === 0 || (await retry(survivors))) return
    await dropFresh(survivors)

    return
  }
  await dropFresh(fresh)
  uploadErrorKey.value = 'cannotBundle'
}

// The file(s) named by the cannotBundleFile message.
const cannotBundleName = ref('')

// Every picked/dropped file is uploaded (a loose source), appended in order, then
// the set is committed — the sender's order is the container's inner-file order. A
// gate rejection stops the batch there (earlier files stay staged). When the staged
// draft is a SIGNED container, new files CONVERT it: a fresh outer container is
// built with the signed one riding inside as an annex data object.
async function uploadFiles(files: FileList | null) {
  if (!files || files.length === 0 || busy.value) return
  uploading.value = true
  uploadErrorKey.value = ''
  cannotBundleName.value = ''
  const fresh: Staged[] = []
  const freshSigned = new Set<string>()
  try {
    for (const file of Array.from(files)) {
      const result = await docs.upload(file)
      fresh.push({ key: result.id, name: file.name, mime: file.type, size: file.size, sourceId: result.id })
      if (result.hasSignatures) {
        hadSignedUpload.value = true
        freshSigned.add(result.id)
      }
    }
  } catch (e) {
    uploadErrorKey.value = uploadFailureKey(e)
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
  if (fresh.length === 0) return

  // A lone upload that is itself an ASiC-E container is already the at-rest form —
  // adopt it as the draft container instead of bundling it. Its inner files stage
  // exactly like a bundle's; one that already carries signatures marks the draft
  // signed (contents immutable; a later file converts it to a fresh outer container).
  if (fresh.length === 1 && staged.value.length === 0 && !containerId.value) {
    try {
      const meta = await docs.get(fresh[0].key)
      if (meta.innerFiles && meta.innerFiles.length > 0) {
        containerId.value = meta.id
        containerName.value = meta.filename
        containerLocked.value = freshSigned.has(meta.id)
        adoptedMeta.value = { key: meta.id, name: meta.filename, mime: meta.mime, size: meta.size ?? 0 }
        staged.value = meta.innerFiles.map(innerToStaged)
        activeKey.value = staged.value[0]?.key ?? ''
        return
      }
    } catch {
      /* metadata unavailable — fall through and let reconcile decide */
    }
  }

  // The convert path: the staged draft is a SIGNED container (adopted, or entered
  // from its hub) — build a NEW outer container of [the signed container, the new
  // files]. Its own signatures stay intact inside it; the outer draft is unsigned
  // and editable like any bundle.
  if (containerId.value && containerLocked.value) {
    const convert = async (items: Staged[]): Promise<boolean> => {
      const inputs = [containerId.value, ...items.filter((s) => s.sourceId).map((s) => s.sourceId as string)]
      busy.value = true
      try {
        const b = await docs.bundle(inputs)
        containerId.value = b.id
        containerName.value = b.filename
        containerLocked.value = false
        adoptedMeta.value = null
        staged.value = b.innerFiles.map(innerToStaged)
        activeKey.value = staged.value[0]?.key ?? ''

        return true
      } catch {
        return false
      } finally {
        busy.value = false
      }
    }
    if (!(await convert(fresh))) {
      await recoverRefusedSet(fresh, convert)
    }

    return
  }

  staged.value = [...staged.value, ...fresh]
  if (!activeKey.value) activeKey.value = staged.value[0]?.key ?? ''
  if (!(await reconcile())) {
    await recoverRefusedSet(fresh, reconcile)
  }
}

// Remove one staged file. The last one tears down the draft (delete the container or
// the lone loose source); otherwise the set rebundles to what remains.
async function removeStaged(item: Staged) {
  if (busy.value) return
  // A locked (adopted, signed) container has no per-file removal — its contents are
  // immutable, so removing any row removes the whole staged document.
  const next = containerLocked.value ? [] : staged.value.filter((s) => s.key !== item.key)
  if (next.length === 0) {
    busy.value = true
    try {
      if (containerId.value) {
        await docs.remove(containerId.value)
        containerId.value = ''
        containerName.value = ''
      } else if (item.sourceId) {
        await docs.remove(item.sourceId)
      }
      staged.value = []
      hadSignedUpload.value = false
      containerLocked.value = false
      adoptedMeta.value = null
    } catch {
      uploadErrorKey.value = 'generic'
    } finally {
      busy.value = false
    }
    return
  }
  staged.value = next
  await reconcile()
}

// Reorder a staged row (the OrderableList emits the move; the array is ours), then
// rebundle so the container's inner-file order matches.
async function moveStaged(from: number, to: number) {
  if (busy.value || containerLocked.value) return
  const next = [...staged.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  staged.value = next
  if (containerId.value) await reconcile()
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  void uploadFiles(e.dataTransfer?.files ?? null)
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A short, human type tag for a staged file — the extension where there is a sensible
// one, else the MIME subtype (e.g. "PDF").
function typeLabel(f: { mime: string; name: string }): string {
  const ext = f.name.includes('.') ? f.name.split('.').pop() : ''
  if (ext && ext.length <= 5) return ext.toUpperCase()
  const sub = f.mime.split('/').pop()

  return sub ? sub.toUpperCase() : f.mime
}

// --- Recipients ---
const addCoSigner = ref(false)
const coSigner = ref('')
const order = ref<'sequential' | 'parallel'>('sequential')
const coSignerError = ref(false)

// A co-signer is bound to their slot by identity code (PNO/NTR/national code), not an
// email: the envelope reaches them in their signing inbox when they sign in with the
// matching eID. The UI checks a plausible code shape; the envelope service owns strict
// resolution to a real identity at signing time.
const coSignerValid = computed(() => {
  const v = coSigner.value.trim()

  return v.length >= 6 && /^[A-Za-z0-9][A-Za-z0-9-]{4,}$/.test(v)
})

// Continue is gated: once a co-signer is added, a valid identity code is required before
// the flow can proceed. Self-signing (no co-signer) is never gated.
const canContinue = computed(() => !addCoSigner.value || coSignerValid.value)

// The stepper spans the whole flow. Self-signing continues into the signing screen
// (Method·Authenticate·Complete), so it shows all six; adding a co-signer makes this the
// envelope path that ends at Send. `stepIndex` maps directly (document/review/recipients
// share indices 0–2 across both label sets).
const displaySteps = computed(() =>
  (addCoSigner.value
    ? ['document', 'review', 'recipients', 'send']
    : ['document', 'review', 'recipients', 'method', 'authenticate', 'complete']
  ).map((k) => t(`newSigning.step.${k}`)),
)

// The Send summary's format row: what this signing will actually produce. A
// set (2+ files) is always one ASiC-E; a single PDF follows the toggle.
const containerValueKey = computed(() =>
  lonePdf.value && !wrapInContainer.value
    ? 'newSigning.send.containerValuePades'
    : 'newSigning.send.containerValueAsice',
)

const initials = computed(() => {
  const name = session.identity?.name?.trim()
  if (!name) return '?'

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
})

// --- Review preview: one staged file at a time; a set gets a file selector. For a
// container the preview is by (container id, inner name); a lone loose source keeps
// the by-document-id preview. ---
const activeStaged = computed(
  () => staged.value.find((s) => s.key === activeKey.value) ?? staged.value[0] ?? null,
)
const previewDocId = computed(() => containerId.value || activeStaged.value?.sourceId || '')
const previewInnerName = computed(() => (containerId.value ? activeStaged.value?.name : undefined))

// --- Navigation between steps ---
function toReview() {
  if (staged.value.length === 0) return
  if (!activeKey.value || !staged.value.some((s) => s.key === activeKey.value)) {
    activeKey.value = staged.value[0].key
  }
  step.value = 'review'
}
function toRecipients() {
  step.value = 'recipients'
}

// The commit spinner + failure state, shared by both commit points (the self-sign
// commit on the recipients step and the co-sign Send step).
const sending = ref(false)
const sendError = ref(false)

// From recipients: with no co-signer this is a self-signing — build and send a
// ONE-SLOT envelope (your own slot; the same path a co-sign takes) and hand off
// into its signing screen. With a co-signer, move to the send step to build +
// send the multi-signer envelope.
async function fromRecipients() {
  if (!addCoSigner.value) {
    // The set is already ONE unsigned ASiC-E (bundled at staging), so the envelope
    // references that single container. The only non-container case is a lone PDF,
    // which keeps the wrap-toggle flag applied at the signing begin.
    const signId = containerId.value || staged.value[0]?.sourceId || ''
    if (!signId || sending.value) return
    sending.value = true
    sendError.value = false
    try {
      // sendForSignature, not createAndSend: if a completed envelope of the user's
      // already covers this container, the signature joins THAT envelope instead of
      // minting a second one over the same chain.
      const created = await envelopes.sendForSignature({
        title: signedThingName.value,
        orderPolicy: 'parallel',
        documents: [signId],
        slots: [{ orderIndex: 0, role: 'signer' }],
      })
      // The create response names the new slot; fall back to the composed view's
      // "your slot" if an older backend omits it.
      let slotId = created.slotIds?.[0]
      if (!slotId) {
        await envelopes.loadDetail(created.id)
        slotId = envelopes.detail?.slots.find((s) => s.you)?.id
      }
      if (!slotId) throw new Error('no slot')
      // Signing continues the wizard: remember the origin so the signing screen
      // keeps the full six-step flow even after a redirect-provider round trip.
      sessionStorage.setItem(`wizard-origin:${created.id}`, '1')
      router.push({
        name: 'sign-slot',
        params: { id: created.id, slot: slotId },
        query: {
          doc: signId,
          origin: 'new',
          ...(!containerId.value && lonePdf.value && wrapInContainer.value ? { container: '1' } : {}),
        },
      })
    } catch {
      sendError.value = true
    } finally {
      sending.value = false
    }

    return
  }
  if (!coSignerValid.value) {
    coSignerError.value = true

    return
  }
  coSignerError.value = false
  step.value = 'send'
}

// --- Send: build the envelope (you + co-signer slots) and send it ---

// Both parties are signers (the envelope owner is seeded first, at orderIndex 0; the
// co-signer second). No flow is pinned on a slot — each signer's flow is chosen at
// signing time, dictated by how they log in.
function buildSlots(): SlotDraft[] {
  return [
    { orderIndex: 0, role: 'signer' },
    { orderIndex: 1, role: 'signer', identityRef: coSigner.value.trim() },
  ]
}

async function send() {
  const docId = containerId.value || staged.value[0]?.sourceId
  if (!docId) return
  sending.value = true
  sendError.value = false
  try {
    // The set is already ONE unsigned ASiC-E (bundled at staging), so the envelope
    // references that single container; a lone PDF references its source.
    // sendForSignature: a container already covered by one of the user's completed
    // envelopes takes a further round on it rather than a new envelope per signature.
    const created = await envelopes.sendForSignature({
      title: signedThingName.value,
      orderPolicy: order.value,
      documents: [docId],
      slots: buildSlots(),
    })
    router.push({ name: 'envelope', params: { id: created.id } })
  } catch {
    sendError.value = true
  } finally {
    sending.value = false
  }
}

async function onDownload() {
  const s = activeStaged.value
  if (!s) return
  if (containerId.value && s.innerName) await docs.downloadInner(containerId.value, s.innerName)
  else if (s.sourceId) await docs.download(s.sourceId)
}
</script>

<template>
  <AppShell>
    <div class="mx-auto max-w-3xl">
      <h1 class="text-3xl font-bold tracking-tight text-ink">{{ t('newSigning.title') }}</h1>

      <!-- One continuous stepper for the whole flow. -->
      <SigningStepper class="mt-6" :steps="displaySteps" :current="stepIndex" :label="t('newSigning.title')" />

      <!-- Step 1: upload -->
      <section v-if="step === 'document'" class="mt-8">
        <h2 class="text-xl font-bold tracking-tight text-ink">{{ t('newSigning.document.heading') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('newSigning.document.sub') }}</p>

        <!-- Dropzone: drag a file in, or click to browse. Adding a file to a staged
             SIGNED container converts the draft: a new container is built with the
             signed one riding inside as an annex. -->
        <div
          role="button"
          tabindex="0"
          class="mt-5 cursor-pointer rounded-card border-2 border-dashed px-6 py-9 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          :class="dragOver ? 'border-green bg-green-soft' : 'border-line bg-surface hover:bg-band'"
          @click="fileInput?.click()"
          @keydown.enter.prevent="fileInput?.click()"
          @keydown.space.prevent="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="mx-auto mb-3" aria-hidden="true">
            <path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="#0A7A52" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="#9AA0A6" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <p class="text-base font-semibold text-ink">
            {{ uploading ? t('newSigning.document.uploading') : t('newSigning.document.dropTitle') }}
          </p>
          <p class="mt-1 text-[13.5px] text-muted">{{ t('newSigning.document.dropHint') }}</p>
          <input
            ref="fileInput"
            type="file"
            multiple
            class="sr-only"
            :aria-label="t('newSigning.document.browse')"
            @change="uploadFiles(($event.target as HTMLInputElement).files)"
          />
        </div>
        <p v-if="uploadErrorKey" class="mt-3 text-sm text-red-fg" role="alert">
          {{ t('newSigning.document.err.' + uploadErrorKey, { name: cannotBundleName }) }}
        </p>

        <!-- The staged set, in signing order (drag or Alt+arrows to reorder — the
             order IS the container's inner-file order), and the container-format
             control: a single PDF's real choice, or the forced set-wide ASiC-E. -->
        <template v-if="selectedDoc">
          <OrderableList
            class="mt-5"
            :items="listedDocs"
            :item-key="(d) => d.key"
            :label="(d) => d.name"
            :orderable="multiDoc && !busy && !containerLocked"
            @move="moveStaged"
          >
            <template #default="{ item }">
              <span class="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-chip bg-[#F1EFE9] text-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M14 3v5h5" stroke-linejoin="round" />
                  <path d="M7 3h7l5 5v13H5V5a2 2 0 0 1 2-2z" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-ink">{{ item.name }}</span>
                <span class="block truncate font-mono text-[11.5px] text-faint">
                  {{ typeLabel(item) }} · {{ formatSize(item.size) }}
                </span>
              </span>
              <button
                type="button"
                class="grid h-7 w-7 shrink-0 place-items-center rounded-chip text-faint transition-colors hover:bg-band hover:text-ink"
                :aria-label="t('newSigning.document.remove')"
                @click="removeStaged(item)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
                </svg>
              </button>
            </template>
          </OrderableList>

          <div
            v-if="stagedHasSignatures"
            class="mt-3 flex items-center gap-3 rounded-card border border-green-soft-line bg-green-soft p-3.5"
            role="status"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
              class="shrink-0 text-green-deep" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" stroke-linecap="round" />
            </svg>
            <span class="text-[13.5px] text-green-deep">{{ t('newSigning.document.alreadySigned') }}</span>
          </div>

          <template v-if="showFormatToggle">
            <div class="mt-3 flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-3.5">
              <div class="min-w-0">
                <p class="font-semibold text-ink">{{ t('newSigning.document.wrapTitle') }}</p>
                <p class="mt-0.5 text-[13px] text-muted">{{ t('newSigning.document.wrapSub') }}</p>
              </div>
              <span
                role="switch"
                :tabindex="wrapForced ? -1 : 0"
                :aria-checked="wrapOn"
                :aria-disabled="wrapForced || undefined"
                :aria-label="t('newSigning.document.wrapTitle')"
                class="relative h-6 w-[42px] shrink-0 rounded-pill transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                :class="[wrapOn ? 'bg-green' : 'bg-line', wrapForced ? 'cursor-not-allowed opacity-60' : 'cursor-pointer']"
                @click="!wrapForced && (wrapInContainer = !wrapInContainer)"
                @keydown.enter.prevent="!wrapForced && (wrapInContainer = !wrapInContainer)"
                @keydown.space.prevent="!wrapForced && (wrapInContainer = !wrapInContainer)"
              >
                <span
                  class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                  :class="wrapOn ? 'right-0.5' : 'left-0.5'"
                />
              </span>
            </div>
            <p class="mt-2 text-[12px] text-muted">
              {{ t(wrapForced ? 'newSigning.document.wrapForcedNote' : 'newSigning.document.wrapNote') }}
            </p>
          </template>
        </template>

        <!-- Retention note. -->
        <p class="mt-4 flex items-center gap-2 text-[12px] text-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="shrink-0 text-green" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke-linecap="round" />
          </svg>
          {{ t('newSigning.document.ttlNote') }}
        </p>

        <div class="mt-6 flex justify-end">
          <Button :disabled="staged.length === 0 || busy" @click="toReview">{{ t('newSigning.document.continue') }}</Button>
        </div>
      </section>

      <!-- Step 2: review -->
      <section v-else-if="step === 'review'" class="mt-8">
        <h2 class="text-xl font-bold tracking-tight text-ink">{{ t('newSigning.review.heading') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('newSigning.review.sub') }}</p>

        <!-- WYSIWYS assurance banner. -->
        <div class="mt-5 flex items-center gap-3 rounded-card border border-green-soft-line bg-green-soft px-4 py-3">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="shrink-0 text-green-deep" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span class="text-[13.5px] font-semibold text-green-deep">{{ t('newSigning.review.wysiwys') }}</span>
        </div>

        <!-- A set reviews one file at a time: pick which staged file to read. -->
        <div v-if="multiDoc" class="mt-4 flex flex-wrap gap-2" role="tablist" :aria-label="t('newSigning.review.filesLabel')">
          <button
            v-for="(d, i) in selectedDocs"
            :key="d.key"
            type="button"
            role="tab"
            :aria-selected="activeKey === d.key"
            class="max-w-[220px] truncate rounded-pill border px-3 py-1.5 font-mono text-[12px] transition-colors"
            :class="activeKey === d.key ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-muted hover:bg-band'"
            @click="activeKey = d.key"
          >
            {{ i + 1 }} · {{ d.name }}
          </button>
        </div>

        <!-- Review-only preview: the inert page images the user reads before signing,
             rendered on their behalf by the sandboxed preview service. Falls back to
             download-to-review for a type that cannot be rendered. -->
        <DocumentPreview
          :key="activeKey"
          :document-id="previewDocId"
          :inner-name="previewInnerName"
          :filename="activeStaged?.name"
          @download="onDownload"
        />

        <div class="mt-6 flex justify-between">
          <Button variant="outline" @click="step = 'document'">{{ t('common.back') }}</Button>
          <Button @click="toRecipients">{{ t('newSigning.review.continue') }}</Button>
        </div>
      </section>

      <!-- Step 3: recipients -->
      <section v-else-if="step === 'recipients'" class="mt-8">
        <h2 class="text-xl font-bold tracking-tight text-ink">{{ t('newSigning.recipients.heading') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('newSigning.recipients.sub') }}</p>

        <!-- You -->
        <div class="mt-5 flex items-center gap-3 rounded-card border border-line bg-surface p-4">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-green-soft text-sm font-semibold text-green-deep">
            {{ initials }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-ink">{{ session.identity?.name }} · {{ t('newSigning.send.you') }}</span>
            <span class="block text-[13px] text-faint">{{ t('newSigning.recipients.youRole', { loa: session.identity?.loa }) }}</span>
          </span>
          <span class="rounded-chip bg-band px-2 py-1 font-mono text-[10.5px] tracking-[0.06em] text-muted-2">
            {{ t('newSigning.recipients.signerTag') }}
          </span>
        </div>

        <!-- Co-signer — reveals when added; invited by email. -->
        <div
          class="grid transition-all duration-300 ease-out"
          :class="addCoSigner ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
        >
          <div class="overflow-hidden" :inert="!addCoSigner || undefined">
            <div class="pt-3">
              <div class="rounded-card border border-line bg-surface p-4">
                <label class="block text-[12px] font-semibold text-muted-2" for="cosigner">
                  {{ t('newSigning.recipients.label') }}
                </label>
                <input
                  id="cosigner"
                  v-model="coSigner"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="t('newSigning.recipients.placeholder')"
                  class="mt-2 w-full rounded-btn border bg-paper px-3 py-2 text-sm text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                  :class="coSignerError ? 'border-red' : 'border-line'"
                  :aria-invalid="coSignerError"
                  @input="coSignerError = false"
                />
                <p v-if="coSignerError" class="mt-2 text-[12.5px] text-red-fg" role="alert">
                  {{ t('newSigning.recipients.error') }}
                </p>

                <div class="mt-4">
                  <p class="text-[12px] font-semibold text-muted-2">{{ t('newSigning.recipients.orderLabel') }}</p>
                  <div class="mt-2 flex gap-2">
                    <button
                      v-for="o in ['sequential', 'parallel']"
                      :key="o"
                      type="button"
                      class="rounded-btn border px-3 py-1.5 text-[13px] font-medium transition-colors"
                      :class="order === o ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-muted hover:bg-band'"
                      :aria-pressed="order === o"
                      @click="order = o as 'sequential' | 'parallel'"
                    >
                      {{ t(`newSigning.recipients.order.${o}`) }}
                    </button>
                  </div>
                  <p class="mt-2 text-[12px] text-muted">{{ t(`newSigning.recipients.orderHint.${order}`) }}</p>
                </div>

                <button
                  type="button"
                  class="mt-4 text-[13px] font-semibold text-green-deep"
                  @click="addCoSigner = false; coSigner = ''; coSignerError = false"
                >
                  {{ t('newSigning.recipients.remove') }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <button
          v-if="!addCoSigner"
          type="button"
          class="mt-3 flex items-center gap-2 px-1 py-1.5 text-sm font-semibold text-green-deep"
          @click="addCoSigner = true"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          {{ t('newSigning.recipients.add') }}
        </button>

        <div class="mt-4 flex items-start gap-2 rounded-btn border border-amber-line bg-amber-bg p-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="mt-0.5 shrink-0 text-amber-fg" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5m0 3h.01" stroke-linecap="round" />
          </svg>
          <span class="text-[12.5px] text-amber-fg">{{ t('newSigning.recipients.tierNote') }}</span>
        </div>
        <p v-if="addCoSigner" class="mt-2 text-[12px] text-muted">{{ t('newSigning.recipients.notifyNote') }}</p>

        <p v-if="!addCoSigner && sendError" class="mt-4 text-sm text-red-fg" role="alert">{{ t('newSigning.send.failed') }}</p>
        <div class="mt-6 flex justify-between">
          <Button variant="outline" :disabled="sending" @click="step = 'review'">{{ t('common.back') }}</Button>
          <Button :disabled="!canContinue || sending" @click="fromRecipients">
            {{ addCoSigner ? t('newSigning.recipients.continue') : sending ? t('newSigning.send.sending') : t('newSigning.selfOnly.continue') }}
          </Button>
        </div>
        <p v-if="!addCoSigner" class="mt-2 text-right text-[12px] text-muted">{{ t('newSigning.selfOnly.note') }}</p>
      </section>

      <!-- Step 4: send -->
      <section v-else-if="step === 'send'" class="mt-8">
        <h2 class="text-xl font-bold tracking-tight text-ink">{{ t('newSigning.send.heading') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('newSigning.send.sub') }}</p>

        <dl class="mt-5 divide-y divide-line-2 rounded-card border border-line bg-surface px-5 shadow-card">
          <div class="flex justify-between gap-4 py-3">
            <dt class="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{{ t('newSigning.send.document') }}</dt>
            <dd class="min-w-0 text-right text-sm text-ink">
              <template v-if="multiDoc">
                <span v-for="(d, i) in selectedDocs" :key="d.key" class="block truncate">
                  {{ i + 1 }}. {{ d.name }}
                </span>
                <span class="block text-[12px] text-muted">{{ t('newSigning.send.bundleNote', { n: selectedDocs.length }) }}</span>
              </template>
              <span v-else class="block truncate">{{ selectedDoc?.name }}</span>
            </dd>
          </div>
          <div class="flex justify-between gap-4 py-3">
            <dt class="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{{ t('newSigning.send.signers') }}</dt>
            <dd class="text-right text-sm text-ink">
              <span class="block">{{ session.identity?.name }} · {{ t('newSigning.send.you') }}</span>
              <span class="block text-muted-2">{{ coSigner }}</span>
            </dd>
          </div>
          <div class="flex justify-between gap-4 py-3">
            <dt class="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{{ t('newSigning.send.order') }}</dt>
            <dd class="text-sm text-ink">{{ t(`newSigning.recipients.order.${order}`) }}</dd>
          </div>
          <div class="flex justify-between gap-4 py-3">
            <dt class="font-mono text-[12px] uppercase tracking-[0.08em] text-muted">{{ t('newSigning.send.container') }}</dt>
            <dd class="font-mono text-sm text-ink">{{ t(containerValueKey) }}</dd>
          </div>
        </dl>

        <p v-if="sendError" class="mt-4 text-sm text-red-fg" role="alert">{{ t('newSigning.send.failed') }}</p>

        <div class="mt-6 flex justify-between">
          <Button variant="outline" :disabled="sending" @click="step = 'recipients'">{{ t('common.back') }}</Button>
          <Button :disabled="sending" @click="send">
            {{ sending ? t('newSigning.send.sending') : t('newSigning.send.send') }}
          </Button>
        </div>
      </section>
    </div>
  </AppShell>
</template>
