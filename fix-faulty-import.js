const fs = require('fs')
const filePath = 'app/faulty/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Check if import exists
if (!c.includes("import ReprocessModal")) {
  c = c.replace(
    `'use client'\n\nimport { useEffect, useState, useCallback } from 'react'`,
    `'use client'\n\nimport { useEffect, useState, useCallback } from 'react'\nimport ReprocessModal from '@/components/ReprocessModal'`
  )
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Added ReprocessModal import to faulty page')
} else {
  console.log('- ReprocessModal import already exists')
}

// Also verify ReprocessModal is used correctly
console.log('Has ReprocessModal usage:', c.includes('<ReprocessModal'))
console.log('Has handleReprocess (data):', c.includes('handleReprocess = async (data'))
