/**
 * pillar-utils.ts
 * CLIENT-SIDE ONLY — reads from localStorage.
 * Generates a dynamic pillar/folder tree that stays in sync with the Pillars page.
 */

import { PILLARS, SUB_PILLARS, SUB_PILLAR_ITEMS } from './constants'

const LS_PILLARS_KEY          = 'fireova_pillars'
const LS_SUB_PILLARS_KEY      = 'fireova_sub_pillars'
const LS_SUB_PILLAR_ITEMS_KEY = 'fireova_sub_pillar_items'

export interface FolderNode {
  id: string
  name: string
  parent_id?: string | null
}

export interface DynamicPillarData {
  pillars: string[]
  subPillars: Record<string, string[]>
  subPillarItems: Record<string, string[]>
  folderTree: FolderNode[]
  pillarFolderIds: Record<string, string>
  pillarSubfolderIds: Record<string, string[]>
}

export function toFolderSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Reads dynamic pillar data from localStorage and builds the full folder
 * tree + pillar → folder ID mappings. Falls back to static constants if
 * localStorage is empty or unavailable.
 */
export function getDynamicPillarData(): DynamicPillarData {
  let pillars: string[]
  let subPillars: Record<string, string[]>
  let subPillarItems: Record<string, string[]>

  try {
    const pRaw = localStorage.getItem(LS_PILLARS_KEY)
    const sRaw = localStorage.getItem(LS_SUB_PILLARS_KEY)
    const iRaw = localStorage.getItem(LS_SUB_PILLAR_ITEMS_KEY)
    pillars       = pRaw ? (JSON.parse(pRaw) as string[])                       : [...PILLARS]
    subPillars    = sRaw ? (JSON.parse(sRaw) as Record<string, string[]>)       : { ...SUB_PILLARS }
    subPillarItems = iRaw ? (JSON.parse(iRaw) as Record<string, string[]>)      : { ...SUB_PILLAR_ITEMS }
  } catch {
    pillars        = [...PILLARS]
    subPillars     = { ...SUB_PILLARS }
    subPillarItems = { ...SUB_PILLAR_ITEMS }
  }

  const folderTree: FolderNode[] = []

  for (const pillar of pillars) {
    const pId = toFolderSlug(pillar)
    folderTree.push({ id: pId, name: pillar })
    for (const sub of (subPillars[pillar] ?? [])) {
      const sId = `${pId}--${toFolderSlug(sub)}`
      folderTree.push({ id: sId, name: sub, parent_id: pId })
      for (const item of (subPillarItems[sub] ?? [])) {
        folderTree.push({ id: `${sId}--${toFolderSlug(item)}`, name: item, parent_id: sId })
      }
    }
  }

  const pillarFolderIds = Object.fromEntries(
    pillars.map((p) => [p, toFolderSlug(p)])
  )

  const pillarSubfolderIds = Object.fromEntries(
    pillars.map((p) => {
      const pId = toFolderSlug(p)
      return [
        pId,
        folderTree
          .filter((f) => f.id !== pId && f.id.startsWith(pId + '--'))
          .map((f) => f.id),
      ]
    })
  )

  return { pillars, subPillars, subPillarItems, folderTree, pillarFolderIds, pillarSubfolderIds }
}
