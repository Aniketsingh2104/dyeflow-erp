const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// THE REAL FIX: change from controlled input (value=) to uncontrolled (defaultValue=)
// Controlled input: value={batch.planNumber} causes React to reset the field on every render
// Uncontrolled input: defaultValue={batch.planNumber} lets user type freely, save on blur/Enter

const OLD = `                            <input
                              type="number"
                              min="1"
                              value={batch.planNumber || ''}
                              data-plan-idx={idx}
                              onChange={(e) => {
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

const NEW = `                            <input
                              type="number"
                              min="1"
                              key={batch.rowKey + '-' + (batch.planNumber || 'empty')}
                              defaultValue={batch.planNumber || ''}
                              data-plan-idx={idx}
                              data-batch-id={batch.id}
                              data-process={batch.currentProcess}
                              onBlur={(e) => {
                                const val = e.target.value
                                if (val !== String(batch.planNumber || '')) {
                                  updatePlanNumber(batch.id, batch.currentProcess, val, batch.date_calc_plan_raw)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const val = (e.target as HTMLInputElement).value
                                  if (val !== String(batch.planNumber || '')) {
                                    updatePlanNumber(batch.id, batch.currentProcess, val, batch.date_calc_plan_raw)
                                  }
                                  const nextInput = document.querySelector<HTMLInputElement>(
                                    \`input[data-plan-idx="\${idx + 1}"]\`
                                  )
                                  if (nextInput) { nextInput.focus(); nextInput.select() }
                                }
                              }}`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Fixed: input changed from controlled (value=) to uncontrolled (defaultValue=)')
  console.log('  key={rowKey+planNumber} ensures React resets the field after a successful save')
  console.log('  onBlur/Enter only saves when value actually changed')
} else {
  console.error('✗ Pattern not found — showing current input code:')
  const i = c.indexOf('data-plan-idx={idx}')
  if (i > -1) console.log(c.substring(i - 200, i + 400))
}
