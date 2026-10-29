export const backend = {
  async fetch_ig_dashboard_snapshot(args: {
    snapshot_date?: string
    start_date?: string
    end_date?: string
    dashboard_passcode?: string
  }) {
    return (globalThis as any).wmill?.backend?.fetch_ig_dashboard_snapshot
      ? (globalThis as any).wmill.backend.fetch_ig_dashboard_snapshot(args)
      : Promise.reject(new Error('Windmill backend is only available in the raw app runtime'))
  },
  async fetch_ig_funnel(args: {
    start_date?: string
    end_date?: string
    page_name?: string
    ig_username?: string
    max_media?: number
    dashboard_passcode?: string
  }) {
    return (globalThis as any).wmill?.backend?.fetch_ig_funnel
      ? (globalThis as any).wmill.backend.fetch_ig_funnel(args)
      : Promise.reject(new Error('Windmill backend is only available in the raw app runtime'))
  },
  async fetch_ig_unanswered_comments(args: {
    lookback_days?: number
    max_media?: number
    max_comments_per_media?: number
    page_name?: string
    ig_username?: string
    dashboard_passcode?: string
  }) {
    return (globalThis as any).wmill?.backend?.fetch_ig_unanswered_comments
      ? (globalThis as any).wmill.backend.fetch_ig_unanswered_comments(args)
      : Promise.reject(new Error('Windmill backend is only available in the raw app runtime'))
  },
}
