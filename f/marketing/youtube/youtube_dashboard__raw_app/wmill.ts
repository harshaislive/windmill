export const backend = {
  async fetch_youtube_dashboard(args: { snapshot_date?: string; start_date?: string; end_date?: string }) {
    return (globalThis as any).wmill?.backend?.fetch_youtube_dashboard
      ? (globalThis as any).wmill.backend.fetch_youtube_dashboard(args)
      : Promise.reject(new Error("Windmill backend is only available in the raw app runtime"))
  },
}
