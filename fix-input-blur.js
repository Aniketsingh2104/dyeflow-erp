const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Fix: change planNumber input from onChange (fires every keystroke) 
// to onBlur (fires when user leaves the field) + Enter key
// This prevents saving partial numbers like "1" when typing "10"
// and prevents stale date_calc_plan_raw causing wrong dates

const OLD = `                              onChange={(e) => updatePlanNumber(batch.id, batch.currentProcess, e.target.value, batch.date_calc_plan_raw)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  // Find next plan number input by data-plan-idx
                                  const nextIdx = idx + 1
                                  const nextInput = document.querySelector<HTMLInputElement>(
                                    \`input[data-plan-idx="\${nextIdx}"]\`
                                  )
                                  if (nextInput) {
                                    nextInput.focus()
                                    nextInput.select()
                                  }
                                }
                              }}`

const NEW = `                              onChange={(e) => {
                                // Only update local display — don't save on every keystroke
                                const input = e.target
                                input.dataset.dirty = 'true'
                              }}
                              onBlur={(e) => {
                                // Save when user leaves the field
                                updatePlanNumber(batch.id, batch.currentProcess, e.target.value, batch.date_calc_plan_raw)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  // Save current field first
                                  updatePlanNumber(batch.id, batch.currentProcess, (e.target as HTMLInputElement).value, batch.date_calc_plan_raw)
                                  // Then move to next input
                                  const nextIdx = idx + 1
                                  const nextInput = document.querySelector<HTMLInputElement>(
                                    \`input[data-plan-idx="\${nextIdx}"]\`
                                  )
                                  if (nextInput) {
                                    nextInput.focus()
                                    nextInput.select()
                                  }
                                }
                              }}`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Fixed: planNumber input now saves on blur/Enter not on every keystroke')
} else {
  console.error('✗ Pattern not found')
  // Show what is there
  const i = c.indexOf('onKeyDown={(e) => {')
  console.log(c.substring(i-100, i+300))
}
