export const backend = {
  async fetch_linkedin_dashboard(args: { snapshot_date?: string; selected_post_id?: string }) {
    return (globalThis as any).wmill?.backend?.fetch_linkedin_dashboard
      ? (globalThis as any).wmill.backend.fetch_linkedin_dashboard(args)
      : Promise.reject(new Error("Windmill backend is only available in the raw app runtime"))
  },
}
