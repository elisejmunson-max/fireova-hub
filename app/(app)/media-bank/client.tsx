'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { supabaseConfigured, createClient } from '@/lib/supabase/client'
import type { MediaAsset } from '@/lib/types'
import { PRESET_FOLDERS, PILLAR_FOLDER_IDS } from '@/lib/constants'
import { getDynamicPillarData } from '@/lib/pillar-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Folder {
  id: string
  name: string
  parent_id?: string | null
}

interface LocalAsset {
  id: string
  filename: string
  file_type: string
  size_bytes: number
  objectUrl: string
  created_at: string
  storage_path: string
  user_id: string
  tags: string[]
  notes: string | null
  folder_id: string | null
  photographer: string | null
}

type AnyAsset = MediaAsset | LocalAsset

interface Props {
  initialAssets: MediaAsset[]
  userId: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_FOLDERS_KEY = 'fireova_folders'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isLocal(a: AnyAsset): a is LocalAsset {
  return 'objectUrl' in a
}

const isDevMode = (userId: string) => !supabaseConfigured || userId === 'dev'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MediaBankClient({ initialAssets, userId }: Props) {
  const [assets, setAssets] = useState<AnyAsset[]>(initialAssets)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AnyAsset | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [folders, setFolders] = useState<Folder[]>(PRESET_FOLDERS as Folder[])
  const [dynPillarIds, setDynPillarIds] = useState<Set<string>>(new Set(Object.values(PILLAR_FOLDER_IDS)))
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['menu-feature']))
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [addingSubfolderTo, setAddingSubfolderTo] = useState<string | null>(null)
  const [subfolderName, setSubfolderName] = useState('')
  const [folderMenu, setFolderMenu] = useState<string | null>(null) // folder id with open menu
  const [movingFolder, setMovingFolder] = useState<Folder | null>(null)
  const [moveTargetId, setMoveTargetId] = useState<string>('')
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  // Tracks whether the initial load has completed so the save effect doesn't
  // overwrite localStorage on the very first render (before load has run).
  const foldersReady = useRef(false)

  // Load folders + asset meta from localStorage on mount
  useEffect(() => {
    try {
      // Build the dynamic folder tree from current pillar data (merges static + localStorage pillars)
      const dynData = getDynamicPillarData()
      const dynamicTree = dynData.folderTree as Folder[]

      // Update the set of locked pillar-level folder IDs
      setDynPillarIds(new Set(Object.values(dynData.pillarFolderIds)))

      const stored = localStorage.getItem(LS_FOLDERS_KEY)
      if (stored) {
        const parsed: Folder[] = JSON.parse(stored)
        if (parsed.length > 0) {
          // Use saved state (preserves moves/deletes), but add any new folders from
          // the dynamic tree that didn't exist when the user last saved
          const parsedIds = new Set(parsed.map((f) => f.id))
          const newFolders = dynamicTree.filter((f) => !parsedIds.has(f.id))
          setFolders([...parsed, ...newFolders])
          // foldersReady is set to true by the save effect on the following render
        } else {
          setFolders(dynamicTree)
          foldersReady.current = true
        }
      } else {
        setFolders(dynamicTree)
        foldersReady.current = true
      }
    } catch {
      foldersReady.current = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist ALL folders to localStorage (including moved preset subfolders).
  // Skip the first fire (initial render with defaults) so we don't overwrite
  // saved data before the load effect has restored it.
  useEffect(() => {
    if (!foldersReady.current) {
      foldersReady.current = true
      return
    }
    localStorage.setItem(LS_FOLDERS_KEY, JSON.stringify(folders))
  }, [folders])

  // Tags in use
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    assets.forEach((a) => a.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [assets])

  // Filtered assets
  const filteredAssets = useMemo(() => {
    let result = assets
    if (activeFolder) result = result.filter((a) => (a as LocalAsset).folder_id === activeFolder)
    if (activeTag) result = result.filter((a) => a.tags.includes(activeTag))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) => a.filename.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return result
  }, [assets, activeFolder, activeTag, searchQuery])

  function folderCount(folderId: string) {
    return assets.filter((a) => (a as LocalAsset).folder_id === folderId).length
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)

    if (isDevMode(userId)) {
      const newAssets: LocalAsset[] = Array.from(files).map((file) => ({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        filename: file.name,
        file_type: file.type,
        size_bytes: file.size,
        objectUrl: URL.createObjectURL(file),
        created_at: new Date().toISOString(),
        storage_path: '',
        user_id: userId,
        tags: [],
        notes: null,
        folder_id: activeFolder,
        photographer: null,
      }))
      setAssets((prev) => [...newAssets, ...prev])
      setUploading(false)
      return
    }

    const supabase = createClient()
    const newAssets: AnyAsset[] = []

    for (const originalFile of Array.from(files)) {
      // Auto-convert HEIC/HEIF to JPEG so the browser can preview it
      let file = originalFile
      const isHeic = ['image/heic', 'image/heif'].includes(originalFile.type.toLowerCase()) ||
        /\.(heic|heif)$/i.test(originalFile.name)
      if (isHeic) {
        try {
          const heic2any = (await import('heic2any')).default
          const converted = await heic2any({ blob: originalFile, toType: 'image/jpeg', quality: 0.85 })
          const blob = Array.isArray(converted) ? converted[0] : converted
          const newName = originalFile.name.replace(/\.(heic|heif)$/i, '.jpg')
          file = new File([blob], newName, { type: 'image/jpeg' })
        } catch {
          setUploadError(`Could not convert ${originalFile.name} — skipping.`)
          continue
        }
      }

      const ext = file.name.split('.').pop()
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: storageError } = await supabase.storage.from('media').upload(path, file)
      if (storageError) { setUploadError(`Failed to upload ${file.name}: ${storageError.message}`); continue }
      const { data: record, error: dbError } = await supabase.from('media_assets').insert({
        user_id: userId, filename: file.name, storage_path: path,
        file_type: file.type, size_bytes: file.size, tags: [], notes: null,
      }).select().single()
      if (!dbError && record) {
        const asset = { ...record, folder_id: activeFolder, photographer: null }
        newAssets.push(asset)
        // Persist folder_id to DB
        if (activeFolder) {
          await supabase.from('media_assets').update({ folder_id: activeFolder }).eq('id', record.id)
        }
      }
    }

    setAssets((prev) => [...newAssets, ...prev])
    setUploading(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files)
  }

  async function handleDelete(asset: AnyAsset) {
    if (isLocal(asset)) {
      URL.revokeObjectURL(asset.objectUrl)
    } else {
      const supabase = createClient()
      await supabase.storage.from('media').remove([asset.storage_path])
      await supabase.from('media_assets').delete().eq('id', asset.id)
    }
    setAssets((prev) => prev.filter((a) => a.id !== asset.id))
    if (selectedAsset?.id === asset.id) setSelectedAsset(null)
  }

  async function handleUpdateAsset(
    asset: AnyAsset,
    patch: Partial<Pick<LocalAsset, 'tags' | 'notes' | 'folder_id' | 'photographer'>>
  ) {
    const updated = { ...asset, ...patch }
    setAssets((prev) => prev.map((a) => (a.id === asset.id ? updated : a)))
    if (selectedAsset?.id === asset.id) setSelectedAsset(updated)

    if (!isLocal(asset) && !isDevMode(userId)) {
      const supabase = createClient()
      const dbPatch: Record<string, unknown> = {}
      if ('tags' in patch) dbPatch.tags = patch.tags
      if ('notes' in patch) dbPatch.notes = patch.notes
      if ('folder_id' in patch) dbPatch.folder_id = patch.folder_id
      if ('photographer' in patch) dbPatch.photographer = patch.photographer
      if (Object.keys(dbPatch).length > 0) await supabase.from('media_assets').update(dbPatch).eq('id', asset.id)
    }
  }

  function getDisplayUrl(asset: AnyAsset): string {
    if (isLocal(asset)) return asset.objectUrl
    const supabase = createClient()
    return supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
  }

  function addFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const id = `custom-${Date.now()}`
    setFolders((prev) => [...prev, { id, name, parent_id: null }])
    setNewFolderName('')
    setAddingFolder(false)
    setActiveFolder(id)
  }

  function addSubfolder(parentId: string) {
    const name = subfolderName.trim()
    if (!name) return
    const id = `custom-${Date.now()}`
    setFolders((prev) => [...prev, { id, name, parent_id: parentId }])
    setExpandedFolders((prev) => new Set([...prev, parentId]))
    setSubfolderName('')
    setAddingSubfolderTo(null)
    setActiveFolder(id)
  }

  function moveFolder(folderId: string, newParentId: string | null) {
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, parent_id: newParentId } : f))
    if (newParentId) setExpandedFolders((prev) => new Set([...prev, newParentId]))
    setMovingFolder(null)
    setFolderMenu(null)
  }

  function deleteFolder(folderId: string) {
    // Re-parent any children to the deleted folder's parent
    const folder = folders.find((f) => f.id === folderId)
    setFolders((prev) => prev
      .filter((f) => f.id !== folderId)
      .map((f) => f.parent_id === folderId ? { ...f, parent_id: folder?.parent_id ?? null } : f)
    )
    if (activeFolder === folderId) setActiveFolder(null)
    setFolderMenu(null)
  }

  function renameFolder(folderId: string, newName: string) {
    const name = newName.trim()
    if (!name) { setRenamingFolder(null); return }
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, name } : f))
    setRenamingFolder(null)
  }

  // Only top-level pillar folders are locked (managed from the Pillars page)
  const canDelete = (f: Folder) => !dynPillarIds.has(f.id)
  const canMove = (f: Folder) => !dynPillarIds.has(f.id)
  const canRename = (f: Folder) => !dynPillarIds.has(f.id)
  // Valid move targets: any folder that is not the folder itself or its descendants
  function getMoveTargets(folderId: string): Folder[] {
    const descendants = new Set<string>()
    function collect(id: string) {
      folders.filter((f) => f.parent_id === id).forEach((f) => { descendants.add(f.id); collect(f.id) })
    }
    collect(folderId)
    return folders.filter((f) => f.id !== folderId && !descendants.has(f.id))
  }

  const isImage = (t: string) => t.startsWith('image/')
  const isVideo = (t: string) => t.startsWith('video/')
  // HEIC/HEIF and other raw formats can't be rendered by browsers
  const canPreview = (t: string) => isImage(t) && !['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'].includes(t.toLowerCase())
  const devMode = isDevMode(userId)

  const activeFolderName = folders.find((f) => f.id === activeFolder)?.name

  function renderFolderRow(folder: Folder, depth: number): React.ReactNode {
    const children = folders.filter((f) => f.parent_id === folder.id)
    const isExpanded = expandedFolders.has(folder.id)
    const isActive = activeFolder === folder.id
    const count = folderCount(folder.id)
    const hasChildren = children.length > 0 || addingSubfolderTo === folder.id
    const isMenuOpen = folderMenu === folder.id
    const isAddingSub = addingSubfolderTo === folder.id
    const isRenaming = renamingFolder === folder.id

    const showActions = hoveredFolder === folder.id || isMenuOpen

    return (
      <div key={folder.id}>
        {/* Inline rename input */}
        {isRenaming ? (
          <div style={{ paddingLeft: `${8 + depth * 12 + 20}px`, paddingRight: '8px' }} className="py-1">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') renameFolder(folder.id, renameValue)
                if (e.key === 'Escape') setRenamingFolder(null)
              }}
              onBlur={() => renameFolder(folder.id, renameValue)}
              className="input text-xs py-1 w-full"
              autoFocus
            />
          </div>
        ) : (
          <div
            className={`relative flex items-center gap-1 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
              isActive ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'
            }`}
            style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
            onClick={() => { setActiveFolder(folder.id); setFolderMenu(null) }}
            onDoubleClick={(e) => {
              if (!canRename(folder)) return
              e.stopPropagation()
              setRenamingFolder(folder.id)
              setRenameValue(folder.name)
              setFolderMenu(null)
            }}
            onMouseEnter={() => setHoveredFolder(folder.id)}
            onMouseLeave={() => { if (!isMenuOpen) setHoveredFolder(null) }}
          >
            {/* Expand/collapse chevron */}
            <button
              className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-transform ${
                isActive ? 'text-stone-300 hover:text-white' : 'text-stone-400 hover:text-stone-600'
              } ${!hasChildren ? 'invisible' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setExpandedFolders((prev) => {
                  const next = new Set(prev)
                  if (next.has(folder.id)) next.delete(folder.id)
                  else next.add(folder.id)
                  return next
                })
              }}
            >
              <ChevronRightIcon className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
            </button>

            {/* Folder name */}
            <span className="flex-1 truncate text-xs">{folder.name}</span>

            {/* Asset count (hide when actions are showing) */}
            {count > 0 && !showActions && (
              <span className={`text-xs flex-shrink-0 ${isActive ? 'text-stone-300' : 'text-stone-400'}`}>{count}</span>
            )}

            {/* Action buttons — shown on hover via state */}
            {showActions && (
              <div
                className="flex items-center gap-0.5 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  title="Add subfolder"
                  className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                    isActive ? 'text-stone-300 hover:bg-stone-700' : 'text-stone-400 hover:bg-stone-200'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setAddingSubfolderTo(folder.id)
                    setSubfolderName('')
                    setFolderMenu(null)
                    setHoveredFolder(null)
                    setExpandedFolders((prev) => new Set([...prev, folder.id]))
                  }}
                >
                  <PlusIcon className="w-3 h-3" />
                </button>
                {(canRename(folder) || canMove(folder) || canDelete(folder)) && (
                  <div className="relative">
                    <button
                      title="Folder options"
                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                        isActive ? 'text-stone-300 hover:bg-stone-700' : 'text-stone-400 hover:bg-stone-200'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFolderMenu(isMenuOpen ? null : folder.id)
                      }}
                    >
                      <DotsIcon className="w-3 h-3" />
                    </button>
                    {isMenuOpen && (
                      <div className="absolute right-0 top-6 z-30 bg-white rounded-lg shadow-lg border border-stone-200 py-1 w-36">
                        {canRename(folder) && (
                          <button
                            className="w-full px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenamingFolder(folder.id)
                              setRenameValue(folder.name)
                              setFolderMenu(null)
                              setHoveredFolder(null)
                            }}
                          >
                            Rename
                          </button>
                        )}
                        {canMove(folder) && (
                          <button
                            className="w-full px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMovingFolder(folder)
                              setMoveTargetId(folder.parent_id ?? '')
                              setFolderMenu(null)
                              setHoveredFolder(null)
                            }}
                          >
                            Move to…
                          </button>
                        )}
                        {canDelete(folder) && (
                          <button
                            className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteFolder(folder.id)
                            }}
                          >
                            Delete folder
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* Inline subfolder input */}
        {isAddingSub && (
          <div className="mt-0.5 mb-1 space-y-1 pr-2" style={{ paddingLeft: `${8 + (depth + 1) * 12 + 4}px` }}>
            <input
              type="text"
              value={subfolderName}
              onChange={(e) => setSubfolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSubfolder(folder.id)
                if (e.key === 'Escape') { setAddingSubfolderTo(null); setSubfolderName('') }
              }}
              placeholder="Subfolder name..."
              className="input text-xs py-1 w-full"
              autoFocus
            />
            <div className="flex gap-1">
              <button onClick={() => addSubfolder(folder.id)} disabled={!subfolderName.trim()} className="flex-1 px-2 py-0.5 rounded bg-ember-600 text-white text-xs font-medium disabled:opacity-40 hover:bg-ember-700 transition-colors">Add</button>
              <button onClick={() => { setAddingSubfolderTo(null); setSubfolderName('') }} className="flex-1 px-2 py-0.5 rounded bg-stone-100 text-stone-600 text-xs hover:bg-stone-200 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Children */}
        {isExpanded && children.map((child) => renderFolderRow(child, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Media Bank</h1>
            <p className="text-stone-500 text-sm mt-0.5">{assets.length} asset{assets.length !== 1 ? 's' : ''} uploaded</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-primary">
            {uploading ? <Spinner /> : <UploadIcon className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </div>
      </div>

      <div className="page-content">
        {devMode && assets.length === 0 && !activeFolder && (
          <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">
            Running in local mode — files preview this session only. Add Supabase credentials to persist uploads.
          </div>
        )}
        {uploadError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-lg">{uploadError}</div>
        )}

        <div className="flex gap-6">
          {/* Folder sidebar */}
          <div className="w-48 flex-shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2 px-2">Folders</p>
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveFolder(null)}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  activeFolder === null ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span className="flex items-center gap-2"><FolderOpenIcon className="w-4 h-4 opacity-70" />All Files</span>
                <span className={`text-xs ${activeFolder === null ? 'text-stone-300' : 'text-stone-400'}`}>{assets.length}</span>
              </button>

              {folders.filter((f) => !f.parent_id).map((folder) => renderFolderRow(folder, 0))}
            </nav>

            {/* New folder */}
            <div className="mt-3 px-1">
              {addingFolder ? (
                <div className="space-y-1.5">
                  <input
                    ref={newFolderInputRef}
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addFolder(); if (e.key === 'Escape') setAddingFolder(false) }}
                    placeholder="Folder name..."
                    className="input text-xs py-1.5 w-full"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button onClick={addFolder} disabled={!newFolderName.trim()} className="flex-1 px-2 py-1 rounded bg-ember-600 text-white text-xs font-medium disabled:opacity-40 hover:bg-ember-700 transition-colors">Add</button>
                    <button onClick={() => { setAddingFolder(false); setNewFolderName('') }} className="flex-1 px-2 py-1 rounded bg-stone-100 text-stone-600 text-xs hover:bg-stone-200 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingFolder(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" /> New folder
                </button>
              )}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Search + tag filters */}
            {assets.length > 0 && (
              <div className="mb-5 space-y-3">
                <div className="flex items-center gap-3">
                  {activeFolderName && (
                    <h2 className="text-sm font-semibold text-stone-700">{activeFolderName}</h2>
                  )}
                  <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by filename or tag..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input pl-9 text-sm"
                    />
                  </div>
                </div>
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setActiveTag(null)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTag === null ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                    >
                      All
                    </button>
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTag === tag ? 'bg-ember-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-6 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-ember-400 bg-ember-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}
            >
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-2">
                <UploadIcon className="w-4 h-4 text-stone-400" />
              </div>
              <p className="text-sm font-medium text-stone-700">
                {dragOver ? 'Drop to upload' : activeFolderName ? `Drop into ${activeFolderName}` : 'Drag and drop files here'}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">or click to browse — JPG, PNG, MP4, MOV</p>
            </div>

            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

            {filteredAssets.length === 0 ? (
              assets.length === 0
                ? <EmptyState onUpload={() => fileInputRef.current?.click()} />
                : <div className="text-center py-16 text-stone-400 text-sm">No assets here yet.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all ${selectedAsset?.id === asset.id ? 'border-ember-400 ring-2 ring-ember-300' : 'border-stone-200 hover:border-stone-300'}`}
                  >
                    <div className="aspect-square bg-stone-100 relative overflow-hidden">
                      {canPreview(asset.file_type) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getDisplayUrl(asset)} alt={asset.filename} className="absolute inset-0 w-full h-full object-cover" />
                      ) : isVideo(asset.file_type) ? (
                        <div className="absolute inset-0 flex items-center justify-center"><VideoIcon className="w-10 h-10 text-stone-400" /></div>
                      ) : isImage(asset.file_type) ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <MediaIcon className="w-8 h-8 text-stone-300" />
                          <span className="text-[10px] font-medium text-stone-400 uppercase">{asset.file_type.split('/')[1] ?? 'image'}</span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><FileIcon className="w-10 h-10 text-stone-400" /></div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium text-stone-700 truncate">{asset.filename}</p>
                      <p className="text-xs text-stone-400">{formatBytes(asset.size_bytes)}</p>
                      {(asset as LocalAsset).photographer && (
                        <p className="text-[10px] text-stone-400 truncate mt-0.5">by {(asset as LocalAsset).photographer}</p>
                      )}
                      {asset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {asset.tags.slice(0, 2).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-500">{t}</span>
                          ))}
                          {asset.tags.length > 2 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-400">+{asset.tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedAsset && (
        <AssetPanel
          asset={selectedAsset}
          folders={folders}
          onClose={() => setSelectedAsset(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdateAsset}
          getDisplayUrl={getDisplayUrl}
          isImage={isImage}
          canPreview={canPreview}
        />
      )}

      {/* Close folder menu on outside click */}
      {folderMenu && (
        <div className="fixed inset-0 z-20" onClick={() => setFolderMenu(null)} />
      )}

      {/* Move folder modal */}
      {movingFolder && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setMovingFolder(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-72" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-stone-900 mb-1">Move folder</h3>
            <p className="text-xs text-stone-500 mb-4">Moving <strong className="text-stone-700">{movingFolder.name}</strong></p>
            <label className="label text-xs">Move into</label>
            <select
              value={moveTargetId}
              onChange={(e) => setMoveTargetId(e.target.value)}
              className="input text-sm mt-1"
            >
              <option value="">Top level (no parent)</option>
              {getMoveTargets(movingFolder.id).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <div className="flex gap-2 mt-4">
              <button
                className="flex-1 btn-primary py-1.5 text-sm justify-center"
                onClick={() => moveFolder(movingFolder.id, moveTargetId || null)}
              >
                Move
              </button>
              <button
                className="flex-1 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-sm hover:bg-stone-200 transition-colors"
                onClick={() => setMovingFolder(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Asset detail panel
// ---------------------------------------------------------------------------

interface PanelProps {
  asset: AnyAsset
  folders: Folder[]
  onClose: () => void
  onDelete: (a: AnyAsset) => void
  onUpdate: (a: AnyAsset, patch: Partial<Pick<LocalAsset, 'tags' | 'notes' | 'folder_id' | 'photographer'>>) => void
  getDisplayUrl: (a: AnyAsset) => string
  isImage: (t: string) => boolean
  canPreview: (t: string) => boolean
}

function AssetPanel({ asset, folders, onClose, onDelete, onUpdate, getDisplayUrl, isImage, canPreview }: PanelProps) {
  const [tagInput, setTagInput] = useState('')
  const [notes, setNotes] = useState(asset.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)
  const [photographer, setPhotographer] = useState((asset as LocalAsset).photographer ?? '')
  const [photographerDirty, setPhotographerDirty] = useState(false)

  // Sync when selected asset changes
  const assetId = asset.id
  const [lastId, setLastId] = useState(assetId)
  if (assetId !== lastId) {
    setLastId(assetId)
    setTagInput('')
    setNotes(asset.notes ?? '')
    setNotesDirty(false)
    setPhotographer((asset as LocalAsset).photographer ?? '')
    setPhotographerDirty(false)
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase()
    if (!tag || asset.tags.includes(tag)) { setTagInput(''); return }
    onUpdate(asset, { tags: [...asset.tags, tag] })
    setTagInput('')
  }

  function removeTag(tag: string) {
    onUpdate(asset, { tags: asset.tags.filter((t) => t !== tag) })
  }

  function saveNotes() {
    if (!notesDirty) return
    onUpdate(asset, { notes: notes || null })
    setNotesDirty(false)
  }

  function formatHandle(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ''
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
  }

  function savePhotographer() {
    if (!photographerDirty) return
    const formatted = formatHandle(photographer)
    setPhotographer(formatted)
    onUpdate(asset, { photographer: formatted || null })
    setPhotographerDirty(false)
  }

  const currentFolderId = (asset as LocalAsset).folder_id ?? null

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-stone-200 z-20 overflow-y-auto shadow-warm-md">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-stone-900">Asset Details</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1"><CloseIcon className="w-4 h-4" /></button>
        </div>

        {isImage(asset.file_type) && (
          <div className="aspect-video relative rounded-lg overflow-hidden bg-stone-100 mb-4">
            {canPreview(asset.file_type) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getDisplayUrl(asset)} alt={asset.filename} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <MediaIcon className="w-10 h-10 text-stone-300" />
                <span className="text-xs font-medium text-stone-400 uppercase">{asset.file_type.split('/')[1] ?? 'image'}</span>
                <span className="text-[10px] text-stone-400">Preview not available in browser</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 text-sm">
          {/* Metadata */}
          <div className="space-y-2">
            <div><p className="text-xs text-stone-400 mb-0.5">Filename</p><p className="text-stone-700 font-medium break-all">{asset.filename}</p></div>
            <div className="flex gap-4">
              <div><p className="text-xs text-stone-400 mb-0.5">Type</p><p className="text-stone-600">{asset.file_type.split('/')[1]?.toUpperCase() ?? asset.file_type}</p></div>
              <div><p className="text-xs text-stone-400 mb-0.5">Size</p><p className="text-stone-600">{formatBytes(asset.size_bytes)}</p></div>
            </div>
            <div><p className="text-xs text-stone-400 mb-0.5">Uploaded</p><p className="text-stone-600">{formatDate(asset.created_at)}</p></div>
            {isLocal(asset) && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Local session only</span>
            )}
          </div>

          {/* Folder */}
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Folder</p>
            <select
              value={currentFolderId ?? ''}
              onChange={(e) => onUpdate(asset, { folder_id: e.target.value || null })}
              className="input text-xs py-1.5"
            >
              <option value="">No folder</option>
              {folders.filter((f) => !f.parent_id).flatMap((f) => {
                const children = folders.filter((c) => c.parent_id === f.id)
                return [
                  <option key={f.id} value={f.id}>{f.name}</option>,
                  ...children.flatMap((c) => {
                    const grandchildren = folders.filter((gc) => gc.parent_id === c.id)
                    return [
                      <option key={c.id} value={c.id}>{'\u00A0\u00A0'}{c.name}</option>,
                      ...grandchildren.map((gc) => (
                        <option key={gc.id} value={gc.id}>{'\u00A0\u00A0\u00A0\u00A0'}{gc.name}</option>
                      )),
                    ]
                  }),
                ]
              })}
            </select>
          </div>

          {/* Photographer */}
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Photo Credit</p>
            <input
              type="text"
              value={photographer}
              onChange={(e) => { setPhotographer(e.target.value); setPhotographerDirty(true) }}
              onBlur={savePhotographer}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              placeholder="@photographer"
              className="input text-xs py-1.5"
            />
            {photographer && (
              <p className="text-xs text-stone-400 mt-1">Will appear in captions as: {formatHandle(photographer)}</p>
            )}
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Tags</p>
            {asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {asset.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-stone-400 hover:text-stone-700 leading-none" aria-label={`Remove ${tag}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add a tag..."
                className="input text-xs flex-1 py-1.5"
              />
              <button onClick={addTag} disabled={!tagInput.trim()} className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 hover:bg-stone-200 text-xs font-medium disabled:opacity-40 transition-colors">Add</button>
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Press Enter to add. Use tags like "wedding", "pizza", "team".</p>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesDirty(true) }}
              onBlur={saveNotes}
              placeholder="Caption ideas, event name, context..."
              rows={3}
              className="input text-xs resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          <a href={getDisplayUrl(asset)} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full justify-center text-xs">
            <ExternalLinkIcon className="w-3.5 h-3.5" /> Open file
          </a>
          <button onClick={() => onDelete(asset)} className="w-full px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4"><MediaIcon className="w-6 h-6 text-stone-400" /></div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1">Your media bank is empty</h3>
      <p className="text-sm text-stone-500 mb-5 max-w-xs mx-auto">Upload photos and videos from your events. Keep everything in one place.</p>
      <button onClick={onUpload} className="btn-primary"><UploadIcon className="w-4 h-4" />Upload your first asset</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>
}
function UploadIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
}
function MediaIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
}
function FileIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
}
function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function ExternalLinkIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
}
function FolderIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
}
function ChevronRightIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
}
function FolderOpenIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
}
function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
}
function DotsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 16 16"><circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" /></svg>
}
function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
}
