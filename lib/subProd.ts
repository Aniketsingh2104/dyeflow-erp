// Sub Prod No. — the production number of a batch from the other system
// (e.g. "P-5201-A"). One per batch, optional, entered when splitting and
// editable later (Splitted Orders, Batch page). Saved in CAPITALS, trimmed,
// max 30 characters. A repair batch keeps the original batch's number.

export const SUB_PROD_MAX = 30

/** "  p-5201-a " → "P-5201-A"; empty → null; longer than 30 → cut to 30 */
export function cleanSubProd(v: any): string | null {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, ' ').trim().toUpperCase()
  return s ? s.slice(0, SUB_PROD_MAX) : null
}

/** Sub Prod number written into imported order remarks: "… | Sub Prod: P-5128-A | Hist.Machines: …" */
export function subProdFromRemarks(remarks: any): string | null {
  const m = String(remarks ?? '').match(/Sub\s*Prod\s*(?:No\.?)?\s*[:\-]\s*([^|\n]+)/i)
  return m ? cleanSubProd(m[1]) : null
}

/** "DYE26-0102-B1 · P-5201-A" — for places with no room for a column */
export function withSubProd(batchId: any, subProd: any): string {
  const id = String(batchId ?? '')
  const sp = cleanSubProd(subProd)
  return sp ? `${id} · ${sp}` : id
}
