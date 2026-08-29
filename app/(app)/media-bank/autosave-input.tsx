'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  placeholder?: string
  onSave: (value: string) => Promise<void>
}

export default function AutosaveInput({ value, placeholder, onSave }: Props) {
  const [draft, setDraft] = useState(value)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function change(next: string) {
    setDraft(next)
    setStatus('idle')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setStatus('saving')
      try {
        await onSave(next)
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 1500)
      } catch {
        setStatus('error')
      }
    }, 700)
  }

  return <div>
    <input value={draft} onChange={e => change(e.target.value)} placeholder={placeholder} className="input w-full" />
    <p className="mt-1 h-4 text-xs text-stone-400">
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Could not save' : ''}
    </p>
  </div>
}
