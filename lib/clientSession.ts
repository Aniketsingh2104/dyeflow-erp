/**
 * lib/clientSession.ts — browser-side copy of the signed-in user (UI only).
 *
 * localStorage 'dyeflow_session' holds the user's name and menu permissions so
 * pages can show/hide things without a round trip. It grants NO access: every
 * request is checked on the server against the signed HttpOnly cookie
 * (see lib/session.ts and proxy.ts).
 */
export const UI_SESSION_KEY = 'dyeflow_session'

export function saveUiSession(u: any) {
  try {
    localStorage.setItem(UI_SESSION_KEY, JSON.stringify({
      id:          u.id,
      username:    u.username,
      fullName:    u.full_name,
      role:        u.role,
      permissions: u.permissions || null,
      scopeMode:   u.scope_mode  || 'all',
      unit:        u.unit        || null,
      party:       u.party       || null,
      loginAt:     new Date().toISOString(),
    }))
  } catch {}
}

export function clearUiSession() {
  try { localStorage.removeItem(UI_SESSION_KEY) } catch {}
  // old pre-security cookie (was readable/editable by JavaScript)
  try { document.cookie = 'dyeflow_session=; path=/; max-age=0' } catch {}
}
