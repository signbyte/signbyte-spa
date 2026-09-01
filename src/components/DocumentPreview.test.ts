import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import DocumentPreview from './DocumentPreview.vue'
import { api } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), postForm: vi.fn(), del: vi.fn(), download: vi.fn() },
  }
})

const mockGet = vi.mocked(api.get)

function mountPreview() {
  return mount(DocumentPreview, {
    props: { documentId: 'doc-1', filename: 'lease.pdf' },
    global: { plugins: [i18n, createPinia()] },
  })
}

describe('DocumentPreview', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    i18n.global.locale.value = 'en'
  })

  it('renders inert page images with a pager, fetched by index through the portal API', async () => {
    mockGet
      .mockResolvedValueOnce({
        documentId: 'doc-1',
        renderable: true,
        pageCount: 2,
        pages: [
          { index: 0, width: 800, height: 1000, imageRef: 'a' },
          { index: 1, width: 800, height: 1000, imageRef: 'b' },
        ],
      })
      .mockResolvedValueOnce({ documentId: 'doc-1', pages: ['one', 'two'] })

    const w = mountPreview()
    await flushPromises()

    expect(w.get('img').attributes('src')).toContain('/documents/doc-1/preview/pages/0')
    expect(w.text()).toContain('page 1 of 2')

    const next = w.findAll('button').find((b) => b.text() === 'Next')
    await next?.trigger('click')

    expect(w.get('img').attributes('src')).toContain('/documents/doc-1/preview/pages/1')
    expect(w.text()).toContain('page 2 of 2')
  })

  it('offers download-to-review for a type that cannot be previewed', async () => {
    mockGet.mockResolvedValueOnce({
      documentId: 'doc-1',
      renderable: false,
      reason: 'unsupported_format',
      mime: 'text/plain',
    })

    const w = mountPreview()
    await flushPromises()

    expect(w.find('img').exists()).toBe(false)
    const dl = w.findAll('button').find((b) => b.text() === 'Download to review')
    await dl?.trigger('click')
    expect(w.emitted('download')).toBeTruthy()
  })

  it('shows a safe message and a retry on a transport failure', async () => {
    const { ApiError } = await import('@/lib/api')
    mockGet.mockRejectedValueOnce(new ApiError(502, 'upstream_error', {}))

    const w = mountPreview()
    await flushPromises()

    expect(w.text()).toContain('temporarily unavailable')
    expect(w.findAll('button').some((b) => b.text() === 'Try again')).toBe(true)
  })
})
