'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
export default function DyeingFOBRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/fob') }, [])
  return null
}
