import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import VerifyPanel from './VerifyPanel.vue'
import { i18n } from '@/i18n'
import { api, ApiError } from '@/lib/api'
import type { Validation } from '@/stores/signing'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, postForm: vi.fn() } }
})
const mockPostForm = vi.mocked(api.postForm)

const passed: Validation = {
  verdict: 'PASSED',
  pass: true,
  format: 'PAdES_BASELINE_LT',
  level: 'Qualified electronic signature',
  signer: 'JOHN DOE',
  signatures: [
    { verdict: 'PASSED', format: 'PAdES_BASELINE_LT', signer: 'JOHN DOE' },
  ],
}

function mountPanel() {
  return mount(VerifyPanel, {
    global: { plugins: [i18n, createPinia()] },
  })
}

// Starts the upload without settling it — the checking card is visible here.
async function startFile(wrapper: ReturnType<typeof mountPanel>) {
  const file = new File(['%PDF-fake'], 'signed.pdf', { type: 'application/pdf' })
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file] })
  await input.trigger('change')
  await flushPromises()
}

// Full round-trip: upload, then run out the minimum-dwell timer so the panel
// settles on its outcome (report or error).
async function chooseFile(wrapper: ReturnType<typeof mountPanel>) {
  await startFile(wrapper)
  await vi.advanceTimersByTimeAsync(800)
  await flushPromises()
}

describe('VerifyPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the checking card (filename, no dropzone) while verification runs', async () => {
    let settle!: (v: Validation) => void
    mockPostForm.mockImplementationOnce(
      () => new Promise<Validation>((resolve) => (settle = resolve)),
    )
    const wrapper = mountPanel()

    await startFile(wrapper)

    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain('signed.pdf')
    expect(status.text()).toContain('Checking signatures')
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)

    settle(passed)
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Checking signatures')
    expect(wrapper.text()).toContain('PASSED')
  })

  it('holds the checking card for the minimum dwell even when the answer is instant', async () => {
    mockPostForm.mockResolvedValueOnce(passed)
    const wrapper = mountPanel()

    await startFile(wrapper)

    // The answer is already in, but the dwell hasn't elapsed — still checking.
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()
    expect(wrapper.text()).toContain('PASSED')
  })

  it('posts the file to /verify and renders the validation report', async () => {
    mockPostForm.mockResolvedValueOnce(passed)
    const wrapper = mountPanel()

    await chooseFile(wrapper)

    expect(mockPostForm).toHaveBeenCalledTimes(1)
    expect(mockPostForm.mock.calls[0][0]).toBe('/verify')
    const form = mockPostForm.mock.calls[0][1] as FormData
    expect(form.get('file')).toBeInstanceOf(File)

    // The full report renders (the shared ValidationReport screen).
    expect(wrapper.text()).toContain('PASSED')
    expect(wrapper.text()).toContain('JOHN DOE')
  })

  it('maps the typed not-signed rejection to its message', async () => {
    mockPostForm.mockRejectedValueOnce(new ApiError(422, 'err:verify:notSigned', {}))
    const wrapper = mountPanel()

    await chooseFile(wrapper)

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('no signature')
  })

  it('maps a 429 to the rate-limit message', async () => {
    mockPostForm.mockRejectedValueOnce(new ApiError(429, null, {}))
    const wrapper = mountPanel()

    await chooseFile(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain('Too many verification requests')
  })

  it('"verify another" resets back to the dropzone', async () => {
    mockPostForm.mockResolvedValueOnce(passed)
    const wrapper = mountPanel()

    await chooseFile(wrapper)
    expect(wrapper.text()).toContain('PASSED')

    const another = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Verify another document'))
    expect(another).toBeTruthy()
    await another!.trigger('click')

    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('PASSED')
  })
})
