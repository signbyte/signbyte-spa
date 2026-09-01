import { vi } from 'vitest'

// jsdom has no layout engine; vue-router's scrollBehavior calls window.scrollTo.
// Stub it so router navigation tests don't emit "Not implemented" noise.
vi.stubGlobal('scrollTo', () => {})
