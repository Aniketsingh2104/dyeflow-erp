// Helper functions for Route Template and Machine Assignment

// Processes that require machine assignment (matching HTML ERP)
export const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']

// Get smart machine suggestion based on process, quantity, and article intelligence
export function getSmartMachine(
  processCode: string,
  qtyKg: number,
  articleIntel: any,
  db: any
): string {
  if (!MACHINE_REQUIRED.includes(processCode)) return ''
  
  // Priority 1: Article intelligence (historical data)
  if (articleIntel) {
    if (processCode === 'D' && articleIntel.dygMcn) return articleIntel.dygMcn
    if (['S', 'S2'].includes(processCode) && articleIntel.scqMcn) return articleIntel.scqMcn
    if (['Add', 'Lev', 'Fix', 'Wash', 'Rc'].includes(processCode) && articleIntel.rcMcn) {
      return articleIntel.rcMcn
    }
  }
  
  // Priority 2: Quantity-based tier matching
  const machines = db.machines || []
  
  if (processCode === 'D') {
    // Dyeing machines - match by capacity
    const suitable = machines.filter((m: any) => 
      m.processes?.includes('D') && (m.capacity || 999) >= qtyKg
    ).sort((a: any, b: any) => (a.capacity || 0) - (b.capacity || 0))
    
    if (suitable.length > 0) return suitable[0].name
  }
  
  if (['S', 'S2'].includes(processCode)) {
    // SCQ machines
    const suitable = machines.filter((m: any) => 
      m.processes?.includes('S') && (m.capacity || 999) >= qtyKg
    ).sort((a: any, b: any) => (a.capacity || 0) - (b.capacity || 0))
    
    if (suitable.length > 0) return suitable[0].name
  }
  
  // Fallback: first machine that handles this process
  const fallback = machines.find((m: any) => m.processes?.includes(processCode))
  return fallback?.name || ''
}

// Get article intelligence from historical data
export function getArticleIntelligence(article: string, db: any): any {
  if (!article || !db.articleIntelligence) return null
  
  const entry = db.articleIntelligence[article.trim().toLowerCase()]
  if (!entry) return null
  
  return {
    supervisor: entry.s || '',
    route: entry.r || '',
    dygMcn: entry.d || '',
    scqMcn: entry.q || '',
    rcMcn: entry.rc || '',
    medianQty: entry.qty || 0
  }
}

// Get default route template index for an article
export function getDefaultRouteTemplateIdx(article: string, db: any): number {
  if (!article) return -1
  
  const routes = db.processRouteMaster || []
  if (routes.length === 0) return -1
  
  // Check if article has defined default route in article-process-machine map
  const articleMap = db.articleProcessMachineMap || {}
  const articleKey = article.trim().toLowerCase()
  
  if (articleMap[articleKey]?.processRoute) {
    const targetCodes = articleMap[articleKey].processRoute
    const defStr = targetCodes.join('/')
    
    for (let i = 0; i < routes.length; i++) {
      const routeStr = (routes[i].steps || []).map((s: any) => s.processCode).join('/')
      if (routeStr === defStr) return i
    }
  }
  
  // Check article intelligence for route
  const intel = getArticleIntelligence(article, db)
  if (intel?.route) {
    const targetCodes = intel.route.split('/').map((c: string) => c.trim()).filter(Boolean)
    const defStr = targetCodes.join('/')
    
    for (let i = 0; i < routes.length; i++) {
      const routeStr = (routes[i].steps || []).map((s: any) => s.processCode).join('/')
      if (routeStr === defStr) return i
    }
  }
  
  // If only one template exists, return it
  if (routes.length === 1) return 0
  
  return -1
}

// Check if order's lab recheck is blocking
export function isSupervisorOrderLabRecheckBlocked(order: any): boolean {
  // If lab recheck is required but not received, block
  if (order.labRecheck && !order.labReceive) {
    return true
  }
  return false
}

// Get machine display name with capacity
export function getMachineDisplayNameWithQty(machineName: string, db: any): string {
  if (!machineName) return ''
  
  const machine = (db.machines || []).find((m: any) => m.name === machineName)
  if (machine && machine.capacity) {
    return `${machine.name} (${machine.capacity}kg)`
  }
  
  return machineName
}
