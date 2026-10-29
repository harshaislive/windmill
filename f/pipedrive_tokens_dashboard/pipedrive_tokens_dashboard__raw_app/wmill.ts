export const backend = {
  async fetch_dashboard(args: {
    start_date?: string
    end_date?: string
  }) {
    return (globalThis as any).wmill?.backend?.fetch_dashboard
      ? (globalThis as any).wmill.backend.fetch_dashboard(args)
      : Promise.reject(new Error('Windmill backend is only available in the raw app runtime'))
  },
}

