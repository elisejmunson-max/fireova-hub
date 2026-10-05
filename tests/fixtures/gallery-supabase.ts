/** Test bundle only: no real client, credentials, storage project, or live media. */
export const createClient = () => ({
  storage: { from: () => ({ getPublicUrl: (storagePath: string) => ({ data: { publicUrl: `/fixture-media/${encodeURIComponent(storagePath)}` } }) }) },
});
