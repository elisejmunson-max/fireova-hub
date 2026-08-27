export type CaptionTool = 'direction' | 'improve' | 'why'
export type ActiveCaptionTool = CaptionTool | null

export const CAPTION_TOOL_PANEL_IDS: Record<CaptionTool, string> = {
  direction: 'caption-tool-panel-direction',
  improve: 'caption-tool-panel-improve',
  why: 'caption-tool-panel-why',
}

export function toggleCaptionTool(current: ActiveCaptionTool, tool: CaptionTool): ActiveCaptionTool {
  return current === tool ? null : tool
}

export function closeCaptionTool(): ActiveCaptionTool {
  return null
}

export function isCaptionToolExpanded(activeTool: ActiveCaptionTool, tool: CaptionTool) {
  return activeTool === tool
}

export function getCaptionToolButtonTone(activeTool: ActiveCaptionTool, tool: CaptionTool) {
  return isCaptionToolExpanded(activeTool, tool) ? 'active' : 'neutral'
}

export function getCaptionToolButtonClassName(activeTool: ActiveCaptionTool, tool: CaptionTool) {
  const base = 'rounded-full px-4 py-2 text-xs font-semibold transition-colors'
  return getCaptionToolButtonTone(activeTool, tool) === 'active'
    ? `${base} bg-stone-950 text-white hover:bg-stone-800`
    : `${base} bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50`
}

export function getCaptionToolArrow(activeTool: ActiveCaptionTool, tool: CaptionTool) {
  return isCaptionToolExpanded(activeTool, tool) ? '▲' : '▼'
}

export function getCaptionToolPanelId(tool: CaptionTool) {
  return CAPTION_TOOL_PANEL_IDS[tool]
}

export function getRenderedCaptionPanels(activeTool: ActiveCaptionTool) {
  return activeTool ? [activeTool] : []
}

export function shouldCloseCaptionToolForOutsideTarget(container: { contains(target: unknown): boolean } | null, target: unknown) {
  return Boolean(container && target && !container.contains(target))
}

export function shouldCloseCaptionToolForKey(key: string) {
  return key === 'Escape'
}

export function completeCaptionToolAction<T>(action: () => T) {
  return {
    activeTool: closeCaptionTool(),
    result: action(),
  }
}
