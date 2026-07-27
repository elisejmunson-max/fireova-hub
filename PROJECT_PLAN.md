# Fireova Marketing Hub Project Plan

## V1 Focus

Fireova Marketing Hub is the internal AI marketing application for Fireova Pizza.
The product direction is mobile first, extremely simple, Instagram-inspired, and built one polished feature at a time.

V1 includes:

- Dashboard
- Upload Event
- Events
- Event gallery
- Generate 5 Posts
- Approve / Skip / Edit
- History
- Settings

## Current Build Phase

The current workflow remains local/mock only:

- Uploaded events are stored in browser localStorage.
- Generated post drafts are stored per event in browser localStorage.
- Approve, Skip, and Edit states persist locally.
- Supabase is not connected for this workflow yet.
- AI generation is not implemented yet.

## Planned AI Post Generation Requirement

When AI post generation is implemented, Generate 5 Posts should create a smart mix of content formats based on the event media.

Possible post formats:

- Single photo
- Photo carousel
- Reel

The AI should:

- Analyze the quantity and quality of photos and videos.
- Prefer vertical video for Reels.
- Avoid duplicate or near-duplicate media.
- Group complementary images into carousels.
- Choose the strongest carousel cover.
- Select and order the best video clips for a Reel.
- Generate captions appropriate to each format.

Target mix when enough media exists:

- 2 single-photo posts
- 1 carousel
- 1 reel
- 1 best-fit post

Do not force this mix when the available media does not support it.
