// Run from C:\dyeflow-react: node fix-enter-key-focus.js
// When user presses Enter in a plan number input, focus moves to the next batch's input

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Replace the planNumber input to add data-row-index and onKeyDown Enter handler
const OLD_INPUT = `                      if (col.key === 'planNumber') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, width: \`\${width}px\` }}>
                            <input
                              type="number"
                              min="1"
                              value={batch.planNumber || ''}
                              onChange={(e) => updatePlanNumber(batch.id, batch.orderId, e.target.value)}
                              placeholder="-"
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: batch.planNumber ? '#10B981' : '#94A3B8',
                                border: '1px solid #E2E8F0',
                                borderRadius: '3px',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </td>
                        )
                      }`

const NEW_INPUT = `                      if (col.key === 'planNumber') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, width: \`\${width}px\` }}>
                            <input
                              type="number"
                              min="1"
                              value={batch.planNumber || ''}
                              data-plan-idx={idx}
                              onChange={(e) => updatePlanNumber(batch.id, batch.orderId, e.target.value)}
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
                              }}
                              placeholder="-"
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: batch.planNumber ? '#10B981' : '#94A3B8',
                                border: '1px solid #E2E8F0',
                                borderRadius: '3px',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </td>
                        )
                      }`

if (content.includes(OLD_INPUT)) {
  content = content.replace(OLD_INPUT, NEW_INPUT)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Enter key now moves focus to next plan number input')
} else {
  console.error('✗ planNumber input pattern not found')
}
