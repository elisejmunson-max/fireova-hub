import type { LocalContentBankItem } from '@/lib/local-fireova-content-bank'
import type { MockMedia } from '@/lib/mock-fireova-content'

export type MediaScoreFactor = {
  signal: 'video' | 'portrait' | 'favorite' | 'approved metadata' | 'faces' | 'smiles' | 'motion' | 'food' | 'fire oven' | 'pizza' | 'crowd' | 'decor' | 'lighting' | 'sharpness' | 'duplicate'
  points: number
  evidence: string
}

export type ScoredEventMedia = {
  mediaId: string
  score: number
  factors: MediaScoreFactor[]
  duplicateOf?: string
  bestFor: Array<'Reel' | 'Photo' | 'Carousel' | 'Story'>
}

export function scoreEventMedia(media: MockMedia[], contentItems: LocalContentBankItem[]): ScoredEventMedia[] {
  const seen = new Map<string, string>()

  return media.map((item) => {
    const metadata = contentItems.find((entry) => entry.mediaId === item.id)
    const text = buildMediaEvidenceText(item, metadata)
    const duplicateKey = `${item.src.trim().toLowerCase()}|${item.alt.trim().toLowerCase()}`
    const duplicateOf = seen.get(duplicateKey)
    if (!duplicateOf) seen.set(duplicateKey, item.id)

    const factors: MediaScoreFactor[] = []
    addFactor(factors, item.type === 'video', 'video', 14, 'The uploaded asset is a video.')
    addFactor(factors, metadata?.orientation === 'Portrait', 'portrait', 8, 'Saved metadata identifies a portrait crop.')
    addFactor(factors, Boolean(metadata?.favorite), 'favorite', 8, 'The user marked this asset as a favorite.')
    addFactor(factors, metadata?.metadataReviewStatus === 'Approved' || metadata?.metadataReviewStatus === 'Manually Edited', 'approved metadata', 7, 'Its media description has been reviewed.')
    addKeywordFactor(factors, text, ['couple', 'bride', 'groom', 'guest', 'person', 'people', 'family', 'team'], 'faces', 8, 'Detected metadata describes people in the frame.')
    addKeywordFactor(factors, text, ['smile', 'laugh', 'reaction', 'joy', 'celebration'], 'smiles', 7, 'Detected metadata describes a positive reaction.')
    addKeywordFactor(factors, text, ['action', 'cutting', 'serving', 'stretching', 'launch', 'dancing', 'motion'], 'motion', 8, 'Detected metadata describes action or motion.')
    addKeywordFactor(factors, text, ['food', 'dish', 'charcuterie', 'dessert', 'cocktail', 'salad', 'appetizer'], 'food', 7, 'Detected metadata identifies food or beverage detail.')
    addKeywordFactor(factors, text, ['fire oven', 'wood-fired oven', 'oven', 'flame', 'fire'], 'fire oven', 9, 'Detected metadata identifies the oven or fire.')
    addKeywordFactor(factors, text, ['pizza', 'slice', 'margherita'], 'pizza', 9, 'Detected metadata identifies pizza.')
    addKeywordFactor(factors, text, ['crowd', 'guests', 'gathering', 'dance floor'], 'crowd', 6, 'Detected metadata identifies a crowd or guest gathering.')
    addKeywordFactor(factors, text, ['decor', 'venue', 'table styling', 'tablescape', 'floral', 'place setting'], 'decor', 6, 'Detected metadata identifies venue or styling detail.')
    addKeywordFactor(factors, text, ['bright', 'well-lit', 'golden hour', 'strong lighting'], 'lighting', 5, 'Detected metadata explicitly describes strong lighting.')
    addKeywordFactor(factors, text, ['sharp', 'crisp', 'in focus', 'detailed'], 'sharpness', 5, 'Detected metadata explicitly describes a sharp image.')
    addFactor(factors, Boolean(duplicateOf), 'duplicate', -30, `Duplicates uploaded asset ${duplicateOf ?? ''}.`)

    const bestFor: ScoredEventMedia['bestFor'] = []
    if (item.type === 'video') bestFor.push('Reel', 'Story')
    else bestFor.push('Photo')
    if (!duplicateOf) bestFor.push('Carousel')

    return {
      mediaId: item.id,
      score: clamp(35 + factors.reduce((sum, factor) => sum + factor.points, 0)),
      factors,
      duplicateOf,
      bestFor: Array.from(new Set(bestFor)),
    }
  }).sort((a, b) => b.score - a.score || a.mediaId.localeCompare(b.mediaId))
}

export function getMediaScoreReasons(scores: ScoredEventMedia[], mediaIds: string[], limit = 3) {
  const selected = new Set(mediaIds)
  return scores
    .filter((score) => selected.has(score.mediaId))
    .flatMap((score) => score.factors.filter((factor) => factor.points > 0).map((factor) => factor.evidence))
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, limit)
}

function buildMediaEvidenceText(media: MockMedia, item?: LocalContentBankItem) {
  return [media.alt, item?.title, item?.description, item?.category, item?.contentTheme, item?.foodItems.join(' '), item?.tags.join(' '), item?.notes, item?.metadataReasoning]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function addKeywordFactor(factors: MediaScoreFactor[], text: string, keywords: string[], signal: MediaScoreFactor['signal'], points: number, evidence: string) {
  addFactor(factors, keywords.some((keyword) => text.includes(keyword)), signal, points, evidence)
}

function addFactor(factors: MediaScoreFactor[], applies: boolean, signal: MediaScoreFactor['signal'], points: number, evidence: string) {
  if (applies) factors.push({ signal, points, evidence })
}

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}
