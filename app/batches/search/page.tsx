'use client'
// Redirect to the batch trace page with empty batchId — shows the search UI
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BatchSearchRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/batches/%20') }, [])
  return null
}
