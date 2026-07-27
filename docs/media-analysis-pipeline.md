# Media Analysis Pipeline V1

Media Analysis creates one reviewable `MediaAnalysis` record per uploaded media item. The first implementation is deterministic and local-first. It does not call a real AI provider, does not predict reach, and does not silently overwrite user metadata.

## Current Boundaries

- Photos are analyzed through `MockMediaAnalysisProvider` using local metadata and event context.
- Videos use a bounded representative-frame extraction helper in the browser, then pass those frame records to the provider interface.
- Browser frame extraction is a development implementation. It is best-effort, thumbnail-only, and gracefully returns failed frame records when a browser cannot decode a video.
- Marketing Intelligence reads approved, user-edited, and high-confidence unreviewed analysis evidence through `getApprovedMediaAnalysisEvidence`.
- Rejected suggestions and failed analyses do not influence Marketing Intelligence.

## Future Provider Integration

Real provider calls should be added behind a server route, not directly in the client.

Required controls:

- Keep provider API keys on the server.
- Validate provider responses before writing `MediaAnalysis`.
- Respect `DEFAULT_MEDIA_ANALYSIS_CONFIG` limits for image dimensions, video frame count, file size, provider enablement, explicit user action, and future cost tracking.
- Preserve `MediaAnalysisReview` across reanalysis.
- Map previously approved and rejected suggestion IDs where deterministic IDs still match.

Suggested route boundary:

```ts
type MediaAnalysisServerRequest = {
  mediaId: string
  eventId?: string
  mediaType: 'photo' | 'video'
  image?: Blob
  representativeFrames?: Array<{
    id: string
    timestampSeconds: number
    localAssetReference: string
  }>
  sourceFingerprint: string
}

type MediaAnalysisServerResponse = MediaAnalysisProviderResult
```

The app should continue to depend on `MediaAnalysisProvider`, not on a vendor SDK.
