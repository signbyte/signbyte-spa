import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import OrderableList from './OrderableList.vue'

type Row = { id: string; name: string }

const items: Row[] = [
  { id: 'a', name: 'a.txt' },
  { id: 'b', name: 'b.txt' },
  { id: 'c', name: 'c.txt' },
]

function mountList(orderable = true) {
  return mount(OrderableList<Row>, {
    props: {
      items,
      itemKey: (r: Row) => r.id,
      label: (r: Row) => r.name,
      orderable,
    },
    slots: { default: `<template #default="{ item }">{{ item.name }}</template>` },
    global: { plugins: [i18n] },
  })
}

describe('OrderableList', () => {
  it('renders rows in order with position badges and grip handles', () => {
    const w = mountList()
    const rows = w.findAll('li')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('1')
    expect(rows[0].text()).toContain('a.txt')
    expect(rows[2].text()).toContain('3')
    expect(w.findAll('[data-testid="grip"]')).toHaveLength(3)
  })

  it('moves the focused row with Alt+ArrowDown / Alt+ArrowUp', async () => {
    const w = mountList()
    const rows = w.findAll('li')
    await rows[0].trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(w.emitted('move')).toEqual([[0, 1]])
    await rows[2].trigger('keydown', { key: 'ArrowUp', altKey: true })
    expect(w.emitted('move')).toEqual([
      [0, 1],
      [2, 1],
    ])
    // Without Alt nothing moves; at the edges nothing moves.
    await rows[0].trigger('keydown', { key: 'ArrowUp' })
    await rows[0].trigger('keydown', { key: 'ArrowUp', altKey: true })
    expect(w.emitted('move')).toHaveLength(2)
  })

  it('emits a move on drag and drop', async () => {
    const w = mountList()
    const rows = w.findAll('li')
    await rows[0].trigger('dragstart', { dataTransfer: { effectAllowed: '' } })
    await rows[2].trigger('dragover', { dataTransfer: {} })
    await rows[2].trigger('drop')
    expect(w.emitted('move')).toEqual([[0, 2]])
  })

  it('renders without any reorder affordance when not orderable', () => {
    const w = mountList(false)
    expect(w.findAll('[data-testid="grip"]')).toHaveLength(0)
    expect(w.find('li').attributes('draggable')).toBeUndefined()
  })
})
