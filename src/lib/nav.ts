// The primary navigation items, in one place so the desktop sidebar, the mobile
// drawer, and the bottom tab bar stay in lockstep. `label` is an i18n key; `icon`
// names a glyph in NavIcon.
export interface NavItem {
  name: string
  label: string
  icon: 'grid' | 'doc' | 'pen' | 'plus' | 'shield' | 'envelope'
}

// One "Dashboard" — it is the merged document library, so the former separate
// "Documents" item is gone. (A dedicated "Envelopes" item is deferred: the dashboard
// already surfaces envelopes, and no standalone envelopes-list view exists yet.)
// "History" lists what left the dashboard: terminal chains whose storage is
// destroyed but whose record remains for the platform's keep window.
export const NAV_ITEMS: readonly NavItem[] = [
  { name: 'home', label: 'nav.dashboard', icon: 'grid' },
  { name: 'sign-new', label: 'nav.newSignature', icon: 'pen' },
  { name: 'verify', label: 'nav.verify', icon: 'shield' },
  { name: 'history', label: 'nav.history', icon: 'doc' },
]
