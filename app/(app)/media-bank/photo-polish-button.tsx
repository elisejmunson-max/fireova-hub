'use client'

import { useState } from 'react'

type PhotoAsset = {
  id: string
  filename: string
  storage_path: string
}

type Props = {
  asset: PhotoAsset
  publicUrl: (path: string) => string
  label: string
  onAccepted: (asset: any) => void
}

export default function PhotoPolishButton({ asset, publicUrl, label, onAccepted }: Props) {
  const [working, setWorking] = useState(false)
  const [edited, setEdited] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function createPolish() {
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/media-assets/${encodeURIComponent(asset.id)}/polish`, { method: 'POST' })
      const text = await response.text()
      let data: any = {}
      try { data = text ? JSON.parse(text) : {} } catch {}
      if (!response.ok) throw new Error(data.error || `Photo polish failed (${response.status})`)
      setEdited(data.edited)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not polish this photo.')
    } finally {
      setWorking(false)
    }
  }

  async function keepOriginal() {
    if (edited?.id) await fetch(`/api/media-assets/${encodeURIComponent(edited.id)}`, { method: 'DELETE' })
    setEdited(null)
  }

  function usePolished() {
    if (!edited) return
    onAccepted(edited)
    setEdited(null)
  }

  return <>
    <button onClick={createPolish} disabled={working} className="btn-primary flex-1 justify-center disabled:opacity-50">
      {working ? 'Polishing…' : label}
    </button>
    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    {edited && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Photo polish</p>
        <h3 className="mt-1 text-xl font-semibold">Before / After</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Original</p>
            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-stone-100"><img src={publicUrl(asset.storage_path)} alt="Original" className="h-full w-full object-contain" /></div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Polished</p>
            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-stone-100"><img src={publicUrl(edited.storage_path)} alt="Polished" className="h-full w-full object-contain" /></div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={keepOriginal} className="btn-secondary">Keep Original</button>
          <button onClick={usePolished} className="btn-primary">Use Polished</button>
        </div>
      </div>
    </div>}
  </>
}
