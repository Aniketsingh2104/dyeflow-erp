const fs = require('fs')

// Fix both files - move 'use client' before import in both files
;['app/fob/page.tsx', 'app/faulty/page.tsx'].forEach(filePath => {
  let c = fs.readFileSync(filePath, 'utf8')
  
  // Fix: move 'use client' to be the very first line
  if (c.startsWith("import ReprocessModal")) {
    c = c.replace(
      `import ReprocessModal from '@/components/ReprocessModal'\n'use client'\n`,
      `'use client'\nimport ReprocessModal from '@/components/ReprocessModal'\n`
    )
    fs.writeFileSync(filePath, c, 'utf8')
    console.log(`✓ Fixed 'use client' position in ${filePath}`)
  } else {
    console.log(`- ${filePath} already correct`)
  }
})
