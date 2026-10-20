// Page access in the browser — the SAME matching as the server's hasPage()
// (lib/access.ts), so a page never shows "Access Denied" for something the
// server allows, or the other way round:
//   a permission on a page also covers the pages under it
//   (/machines → /machines/<id>, /setup → /setup/holiday-master), and a
//   permission on a page under it counts for the parent (/fms/D → /fms).
// Several paths can name the same page (a machine sheet by id or by its
// name slug) — any of them counts.
import type { PagePerm } from '@/lib/permissions'

export interface PageAccess { view: boolean; edit: boolean; delete: boolean }

export function pageAccess(
  pages: Record<string, PagePerm> | null | undefined,
  paths: string | string[],
  isAdmin: boolean,
): PageAccess {
  if (isAdmin) return { view: true, edit: true, delete: true }
  const out: PageAccess = { view: false, edit: false, delete: false }
  if (!pages) return out
  const wanted = (Array.isArray(paths) ? paths : [paths]).filter(Boolean)
  for (const want of wanted) {
    for (const [key, perm] of Object.entries(pages)) {
      if (!perm) continue
      const match = key === want || key.startsWith(want + '/') || want.startsWith(key + '/')
      if (!match) continue
      if (perm.view || perm.edit || perm.delete) out.view = true
      if (perm.edit) out.edit = true
      if (perm.delete) out.delete = true
    }
  }
  return out
}

/** The slug a machine's name had in User Management (lib/permissions fetchPageList) */
export function machineSlug(name: string | null | undefined): string {
  return String(name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/** Every path that names this machine's sheet */
export function machinePaths(m: { id?: string; name?: string } | null | undefined, urlParam?: string): string[] {
  const out = new Set<string>()
  if (urlParam) out.add(`/machines/${urlParam}`)
  if (m?.id) out.add(`/machines/${m.id}`)
  const slug = machineSlug(m?.name)
  if (slug) out.add(`/machines/${slug}`)
  return [...out]
}
