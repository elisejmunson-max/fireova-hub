import assert from 'node:assert/strict'
import test from 'node:test'
import {
  closeCaptionTool,
  completeCaptionToolAction,
  getCaptionToolArrow,
  getCaptionToolButtonClassName,
  getCaptionToolButtonTone,
  getCaptionToolPanelId,
  getRenderedCaptionPanels,
  isCaptionToolExpanded,
  shouldCloseCaptionToolForKey,
  shouldCloseCaptionToolForOutsideTarget,
  toggleCaptionTool,
  type ActiveCaptionTool,
} from '@/lib/content-studio-caption-tools'

test('Improve Caption opens from the closed state', () => {
  assert.equal(toggleCaptionTool(null, 'improve'), 'improve')
})

test('clicking Improve Caption twice closes it', () => {
  const open = toggleCaptionTool(null, 'improve')
  assert.equal(toggleCaptionTool(open, 'improve'), null)
})

test('Why this caption opens and closes', () => {
  const open = toggleCaptionTool(null, 'why')
  assert.equal(open, 'why')
  assert.equal(toggleCaptionTool(open, 'why'), null)
})

test('Caption Direction opens and closes', () => {
  const open = toggleCaptionTool(null, 'direction')
  assert.equal(open, 'direction')
  assert.equal(toggleCaptionTool(open, 'direction'), null)
})

test('opening one tool closes the previous tool', () => {
  assert.equal(toggleCaptionTool('improve', 'why'), 'why')
  assert.equal(toggleCaptionTool('why', 'improve'), 'improve')
  assert.equal(toggleCaptionTool('improve', 'direction'), 'direction')
  assert.equal(toggleCaptionTool('direction', 'why'), 'why')
})

test('only one panel is rendered at a time', () => {
  assert.deepEqual(getRenderedCaptionPanels(null), [])
  assert.deepEqual(getRenderedCaptionPanels('direction'), ['direction'])
  assert.deepEqual(getRenderedCaptionPanels('improve'), ['improve'])
  assert.deepEqual(getRenderedCaptionPanels('why'), ['why'])
})

test('outside click closes the active panel', () => {
  const outsideTarget = { id: 'outside' }
  const container = { contains: (target: unknown) => target === 'inside' }

  assert.equal(shouldCloseCaptionToolForOutsideTarget(container, outsideTarget), true)
})

test('clicking inside the active panel does not close it prematurely', () => {
  const insideTarget = { id: 'inside' }
  const container = { contains: (target: unknown) => target === insideTarget }

  assert.equal(shouldCloseCaptionToolForOutsideTarget(container, insideTarget), false)
})

test('Escape closes the active panel', () => {
  assert.equal(shouldCloseCaptionToolForKey('Escape'), true)
  assert.equal(closeCaptionTool(), null)
})

test('non-Escape keys do not close the active panel', () => {
  assert.equal(shouldCloseCaptionToolForKey('Enter'), false)
  assert.equal(shouldCloseCaptionToolForKey('Tab'), false)
})

test('selecting an improve action closes its panel', () => {
  const action = completeCaptionToolAction(() => 'rewritten caption')

  assert.equal(action.activeTool, null)
  assert.equal(action.result, 'rewritten caption')
})

test('selecting a direction action closes its panel', () => {
  const action = completeCaptionToolAction(() => 'Food Feature')

  assert.equal(action.activeTool, null)
  assert.equal(action.result, 'Food Feature')
})

test('aria-expanded reflects the active state', () => {
  const active: ActiveCaptionTool = 'why'

  assert.equal(isCaptionToolExpanded(active, 'direction'), false)
  assert.equal(isCaptionToolExpanded(active, 'improve'), false)
  assert.equal(isCaptionToolExpanded(active, 'why'), true)
  assert.equal(getCaptionToolPanelId('why'), 'caption-tool-panel-why')
  assert.equal(getCaptionToolPanelId('direction'), 'caption-tool-panel-direction')
  assert.equal(getCaptionToolPanelId('improve'), 'caption-tool-panel-improve')
})

test('arrow indicator reflects open versus closed', () => {
  assert.equal(getCaptionToolArrow('improve', 'improve'), '▲')
  assert.equal(getCaptionToolArrow('improve', 'why'), '▼')
  assert.equal(getCaptionToolArrow('direction', 'direction'), '▲')
  assert.equal(getCaptionToolArrow('direction', 'improve'), '▼')
  assert.equal(getCaptionToolArrow(null, 'why'), '▼')
})

test('existing caption actions still work while closing the panel', () => {
  const caption = 'Fresh pizza on the table.'
  const action = completeCaptionToolAction(() => `${caption} We love getting to share moments like this.`)

  assert.equal(action.activeTool, null)
  assert.equal(action.result, 'Fresh pizza on the table. We love getting to share moments like this.')
})

test('all buttons are neutral when no tool is open', () => {
  assert.equal(getCaptionToolButtonTone(null, 'direction'), 'neutral')
  assert.equal(getCaptionToolButtonTone(null, 'improve'), 'neutral')
  assert.equal(getCaptionToolButtonTone(null, 'why'), 'neutral')
})

test('Caption Direction becomes active only when Direction is open', () => {
  assert.equal(getCaptionToolButtonTone('direction', 'direction'), 'active')
  assert.equal(getCaptionToolButtonTone('direction', 'improve'), 'neutral')
  assert.equal(getCaptionToolButtonTone('direction', 'why'), 'neutral')
})

test('Improve Caption becomes active only when Improve is open', () => {
  assert.equal(getCaptionToolButtonTone('improve', 'direction'), 'neutral')
  assert.equal(getCaptionToolButtonTone('improve', 'improve'), 'active')
  assert.equal(getCaptionToolButtonTone('improve', 'why'), 'neutral')
})

test('Why this caption becomes active only when Why is open', () => {
  assert.equal(getCaptionToolButtonTone('why', 'direction'), 'neutral')
  assert.equal(getCaptionToolButtonTone('why', 'improve'), 'neutral')
  assert.equal(getCaptionToolButtonTone('why', 'why'), 'active')
})

test('opening one tool removes the active style from the previous tool', () => {
  const next = toggleCaptionTool('improve', 'why')

  assert.equal(next, 'why')
  assert.equal(getCaptionToolButtonTone(next, 'direction'), 'neutral')
  assert.equal(getCaptionToolButtonTone(next, 'improve'), 'neutral')
  assert.equal(getCaptionToolButtonTone(next, 'why'), 'active')
})

test('closing the active tool returns all buttons to neutral', () => {
  const next = toggleCaptionTool('improve', 'improve')

  assert.equal(next, null)
  assert.equal(getCaptionToolButtonTone(next, 'direction'), 'neutral')
  assert.equal(getCaptionToolButtonTone(next, 'improve'), 'neutral')
  assert.equal(getCaptionToolButtonTone(next, 'why'), 'neutral')
})

test('button class names match active and neutral visual states', () => {
  const activeClassName = getCaptionToolButtonClassName('why', 'why')
  const neutralClassName = getCaptionToolButtonClassName('why', 'improve')

  assert.match(activeClassName, /bg-stone-950/)
  assert.match(activeClassName, /text-white/)
  assert.doesNotMatch(activeClassName, /ring-1/)
  assert.match(neutralClassName, /bg-white/)
  assert.match(neutralClassName, /text-stone-700/)
  assert.match(neutralClassName, /ring-1/)
  assert.doesNotMatch(neutralClassName, /bg-stone-950/)
})

test('chevron direction and aria-expanded match active visual state', () => {
  const active: ActiveCaptionTool = 'improve'

  assert.equal(getCaptionToolArrow(active, 'improve'), '▲')
  assert.equal(isCaptionToolExpanded(active, 'improve'), true)
  assert.equal(getCaptionToolButtonTone(active, 'improve'), 'active')
  assert.equal(getCaptionToolArrow(active, 'direction'), '▼')
  assert.equal(isCaptionToolExpanded(active, 'direction'), false)
  assert.equal(getCaptionToolButtonTone(active, 'direction'), 'neutral')
  assert.equal(getCaptionToolArrow(active, 'why'), '▼')
  assert.equal(isCaptionToolExpanded(active, 'why'), false)
  assert.equal(getCaptionToolButtonTone(active, 'why'), 'neutral')
})
