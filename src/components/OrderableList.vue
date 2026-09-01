<script setup lang="ts" generic="T">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// One reorder control for every ordered list in the app (container files,
// co-signers): a grip handle drags a row anywhere (a drop line previews the
// landing slot), and a focused row moves with Alt+ArrowUp / Alt+ArrowDown so
// the keyboard path is first-class. The order badge shows each row's current
// 1-based position. The parent owns the array; this component only emits the
// desired move.
const props = defineProps<{
  items: T[]
  // itemKey returns a stable identity for a row (never the index).
  itemKey: (item: T) => string
  // label names one row for assistive tech, e.g. its filename.
  label: (item: T) => string
  // When false the list renders without any reorder affordance (e.g. a
  // parallel signing order, where order is meaningless).
  orderable?: boolean
}>()

const emit = defineEmits<{ (e: 'move', from: number, to: number): void }>()

const { t } = useI18n()

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent) {
  dragIndex.value = i
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(i: number, e: DragEvent) {
  if (dragIndex.value === null) return
  e.preventDefault()
  dropIndex.value = i
}
function onDrop(i: number) {
  const from = dragIndex.value
  dragIndex.value = null
  dropIndex.value = null
  if (from === null || from === i) return
  emit('move', from, i)
}
function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}
function onKeydown(i: number, e: KeyboardEvent) {
  if (!e.altKey) return
  if (e.key === 'ArrowUp' && i > 0) {
    e.preventDefault()
    emit('move', i, i - 1)
  }
  if (e.key === 'ArrowDown' && i < props.items.length - 1) {
    e.preventDefault()
    emit('move', i, i + 1)
  }
}
</script>

<template>
  <ul class="space-y-2.5" role="listbox" :aria-label="t('orderable.listLabel')">
    <li
      v-for="(item, i) in items"
      :key="itemKey(item)"
      role="option"
      :tabindex="orderable ? 0 : undefined"
      :draggable="orderable || undefined"
      :aria-selected="false"
      :aria-label="
        orderable
          ? t('orderable.rowLabel', { name: label(item), position: i + 1, total: items.length })
          : label(item)
      "
      class="flex items-center gap-3 rounded-card border bg-surface px-4 py-3 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
      :class="[
        dragIndex === i ? 'opacity-45' : '',
        dropIndex === i && dragIndex !== null && dragIndex !== i
          ? 'border-green shadow-[0_-3px_0_0_theme(colors.green.DEFAULT)]'
          : 'border-line',
      ]"
      @dragstart="orderable && onDragStart(i, $event)"
      @dragover="orderable && onDragOver(i, $event)"
      @dragleave="dropIndex === i && (dropIndex = null)"
      @drop.prevent="orderable && onDrop(i)"
      @dragend="onDragEnd"
      @keydown="orderable && onKeydown(i, $event)"
    >
      <span
        v-if="orderable"
        class="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-chip text-faint hover:bg-green-soft hover:text-green-deep"
        aria-hidden="true"
        data-testid="grip"
      >
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
          <circle cx="2.5" cy="2.5" r="1.5" /><circle cx="7.5" cy="2.5" r="1.5" />
          <circle cx="2.5" cy="8" r="1.5" /><circle cx="7.5" cy="8" r="1.5" />
          <circle cx="2.5" cy="13.5" r="1.5" /><circle cx="7.5" cy="13.5" r="1.5" />
        </svg>
      </span>
      <span
        v-if="orderable"
        class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-pill bg-band font-mono text-[12px] font-bold text-muted-2"
        aria-hidden="true"
      >
        {{ i + 1 }}
      </span>
      <slot :item="item" :index="i" />
    </li>
  </ul>
</template>
