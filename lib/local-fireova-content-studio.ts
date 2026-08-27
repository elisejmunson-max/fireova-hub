import {
  type LocalFireovaEvent,
  type LocalGeneratedPostDraft,
  type LocalGeneratedPostVendorSnapshot,
} from '@/lib/local-fireova-events'
import {
  buildEventVendorCreditSnapshot,
  readLocalVendors,
  type EventVendorCreditSnapshot,
} from '@/lib/local-fireova-vendors'
import type { MockEvent, MockMedia } from '@/lib/mock-fireova-content'

export type EventPostGoal =
  | 'Event Highlight'
  | 'Wedding Moment'
  | 'Celebration Moment'
  | 'Bridal Celebration'
  | 'Rehearsal Dinner Highlight'
  | 'Couple Story'
  | 'Promotional Event'
  | 'Brand Awareness'
  | 'Product Feature'
  | 'Interactive Experience'
  | 'Guest Engagement'
  | 'Behind the Scenes'
  | 'Vendor Spotlight'
  | 'Venue Spotlight'
  | 'Guest Experience'
  | 'Food Feature'
  | 'Event Recap'

export const EVENT_POST_GOALS: EventPostGoal[] = ['Event Highlight','Wedding Moment','Vendor Spotlight','Guest Experience','Food Feature','Event Recap']
const BABY_SHOWER_POST_GOALS: EventPostGoal[] = ['Event Highlight','Celebration Moment','Food Feature','Guest Experience']
const BRIDAL_SHOWER_POST_GOALS: EventPostGoal[] = ['Bridal Celebration','Event Highlight','Food Feature','Vendor Spotlight']
const REHEARSAL_DINNER_POST_GOALS: EventPostGoal[] = ['Rehearsal Dinner Highlight','Couple Story','Food Feature','Venue Spotlight']
const PROMOTIONS_POST_GOALS: EventPostGoal[] = ['Promotional Event','Brand Awareness','Product Feature','Guest Experience']
const INTERACTIVE_CATERING_POST_GOALS: EventPostGoal[] = ['Interactive Experience','Guest Engagement','Behind the Scenes','Food Feature']

export function findEventForStudio(eventId: string, localEvents: LocalFireovaEvent[]) { return localEvents.find((event) => event.id === eventId) ?? null }

export function createOneEventDraftForStudio({ event, goal, media, reelCover, reelCoverCrop, caption, hashtags, vendorCreditBlock }: { event: LocalFireovaEvent | MockEvent; goal: EventPostGoal; media: MockMedia[]; reelCover?: MockMedia; reelCoverCrop?: LocalGeneratedPostDraft['reelCoverCrop']; caption: string; hashtags: string[]; vendorCreditBlock?: string }): LocalGeneratedPostDraft {
  const selectedMedia = media.length > 0 ? media : getUniqueEventMedia(event)
  const vendorSnapshot = isLocalFireovaEvent(event) ? buildEventVendorCreditSnapshot(event, readLocalVendors()) : undefined
  return { id: `event-draft-${Date.now()}-${crypto.randomUUID()}`, tone: goal, caption: caption.trim(), hashtags, media: selectedMedia[0] ?? event.cover, mediaItems: selectedMedia, reelCover, reelCoverCrop, sourceType: 'Event', sourceId: event.id, sourceLabel: event.name, vendorCreditBlock: vendorCreditBlock?.trim() || vendorSnapshot?.creditBlock, vendorSnapshot: vendorSnapshot as LocalGeneratedPostVendorSnapshot | undefined }
}

export function getUniqueEventMedia(event: LocalFireovaEvent | MockEvent) {
  const seen = new Set<string>(); const media = event.media.length > 0 ? event.media : [event.cover]
  return media.filter((item) => { const key = item.id || item.src; if (seen.has(key)) return false; seen.add(key); return true })
}
export function findEventDraftForMedia(drafts: LocalGeneratedPostDraft[], media: MockMedia) { return drafts.find((draft) => { const draftMedia = draft.mediaItems?.length ? draft.mediaItems : [draft.media]; return draftMedia.some((item) => item.id === media.id || Boolean(item.src && media.src && item.src === media.src)) }) ?? null }

// Event details now flow into the Media Bank intelligence reviewer first.
// Content creation is intentionally a later step after Strong/Edit/Skip review.
export function getEventContentStudioEntryHref(event: LocalFireovaEvent, _drafts: LocalGeneratedPostDraft[]) {
  return `/media-bank?eventId=${encodeURIComponent(event.id)}`
}
export function getPostCreateEventHref(event: LocalFireovaEvent) { return `/media-bank?eventId=${encodeURIComponent(event.id)}` }

export function getRecommendedEventGoal(event: LocalFireovaEvent | MockEvent): EventPostGoal { const type=event.type.toLowerCase(); if(type.includes('baby shower'))return'Event Highlight';if(type.includes('bridal shower'))return'Bridal Celebration';if(type.includes('rehearsal dinner'))return'Rehearsal Dinner Highlight';if(type.includes('promotion')||type.includes('festival'))return'Promotional Event';if(type.includes('interactive catering'))return'Interactive Experience';if(type.includes('wedding'))return'Wedding Moment';if(type.includes('corporate'))return'Event Recap';return'Event Highlight' }
export function getEventPostGoals(event: LocalFireovaEvent | MockEvent | null): EventPostGoal[] { const type=event?.type.toLowerCase()??'';if(type.includes('baby shower'))return BABY_SHOWER_POST_GOALS;if(type.includes('bridal shower'))return BRIDAL_SHOWER_POST_GOALS;if(type.includes('rehearsal dinner'))return REHEARSAL_DINNER_POST_GOALS;if(type.includes('promotion')||type.includes('festival'))return PROMOTIONS_POST_GOALS;if(type.includes('interactive catering'))return INTERACTIVE_CATERING_POST_GOALS;return EVENT_POST_GOALS }
export function createEventCaptionSuggestion(event: LocalFireovaEvent | MockEvent, goal: EventPostGoal, variant=0){const vendorSnapshot=isLocalFireovaEvent(event)?buildEventVendorCreditSnapshot(event,readLocalVendors()):undefined;const options=createGoalCaptions(event,goal,vendorSnapshot);return options[variant%options.length]}
export function createEventHashtags(event: LocalFireovaEvent | MockEvent, goal: EventPostGoal){const rawTags=['FireovaPizza','WoodFiredPizza','DFWCatering',event.type,goal];return Array.from(new Set(rawTags)).map((tag)=>`#${tag.replace(/^#/,'').replace(/[^a-zA-Z0-9]/g,'')}`).filter((tag)=>tag.length>1).slice(0,8)}
export function buildEventCreditsForStudio(event: LocalFireovaEvent | MockEvent){return isLocalFireovaEvent(event)?buildEventVendorCreditSnapshot(event,readLocalVendors()):undefined}
function createGoalCaptions(event: LocalFireovaEvent | MockEvent,goal:EventPostGoal,vendorSnapshot?:EventVendorCreditSnapshot){const primary=createEventCaptionSuggestionWithSnapshot(event,goal,vendorSnapshot);const eventType=event.type.toLowerCase();const venue=vendorSnapshot?.venue?.displayValue??('venueName'in event?event.venueName:undefined);const venueText=venue?` at ${venue}`:'';return[primary,`A ${eventType}${venueText} with fresh Fireova pizza, warm service, and a story worth saving.`,`A few favorite details from ${event.name}${venueText}.`]}
function createEventCaptionSuggestionWithSnapshot(event:LocalFireovaEvent|MockEvent,goal:EventPostGoal,vendorSnapshot?:EventVendorCreditSnapshot){const venue=vendorSnapshot?.venue?.displayValue??('venueName'in event?event.venueName:undefined);const venueText=venue?` at ${venue}`:'';const eventType=event.type.toLowerCase();const nonVenueVendors=vendorSnapshot?.nonVenueVendors??[];const firstVendor=nonVenueVendors[0]?.displayValue;const secondVendor=nonVenueVendors[1]?.displayValue;const vendorPair=[firstVendor,secondVendor].filter(Boolean).join(' and ');const vendorPhrase=vendorPair?` alongside ${vendorPair}`:'';const notesPhrase='notes'in event&&event.notes?` ${event.notes}`:'';switch(goal){case'Wedding Moment':return`A beautiful wedding moment${venueText}, plenty of wood-fired pizza, and the kind of celebration we love serving most.`;case'Celebration Moment':return`A sweet celebration${venueText}, warm guests, and wood-fired pizza served right in the moment.`;case'Bridal Celebration':return`A beautiful bridal celebration${venueText}, thoughtful details, and a Fireova spread made for gathering.`;case'Rehearsal Dinner Highlight':return`A rehearsal dinner highlight from ${event.name}${venueText}, with live fire and a table full of favorite moments.`;case'Couple Story':return`A few favorite moments from ${event.name}${venueText}, celebrating the couple before the big day.`;case'Promotional Event':return`A promotional event${venueText} with live fire, fresh pizza, and a Fireova setup made to draw people in.`;case'Brand Awareness':return`A Fireova moment from ${event.name}${venueText}, sharing the flavor, energy, and service behind the brand.`;case'Product Feature':return`Fresh dough, live fire, and a closer look at what Fireova served for ${event.name}.${notesPhrase}`.trim();case'Interactive Experience':return`An interactive catering experience${venueText}, with guests gathered around the fire and food made right on site.`;case'Guest Engagement':return`Guests, live fire, and fresh pizza coming together for ${event.name}${venueText}.`;case'Behind the Scenes':return`Behind the scenes at ${event.name}${venueText}: setup, fire, and the work that brings the experience together.`;case'Vendor Spotlight':return vendorPair?`Loved serving ${event.name}${venueText}${vendorPhrase}. A thoughtful vendor team makes the whole night feel easy.`:`Loved serving ${event.name}${venueText}. Great people, thoughtful details, and pizza made right on site.`;case'Venue Spotlight':return venue?`A beautiful night at ${venue}, with Fireova pizza served fresh for ${event.name}.`:`A beautiful setting for ${event.name}, with Fireova pizza served fresh on site.`;case'Guest Experience':return`Warm slices, happy guests, and a ${eventType}${venueText} with so much heart.`;case'Food Feature':return`Fresh dough, live fire, and a full table for ${event.name}.${notesPhrase}`.trim();case'Event Recap':return`Some favorite moments from ${event.name}${venueText}.`;default:return`A beautiful ${eventType}${venueText}, plenty of wood-fired pizza, and the kind of event we love serving most.`}}
function isLocalFireovaEvent(event:LocalFireovaEvent|MockEvent):event is LocalFireovaEvent{return'createdAt'in event}
