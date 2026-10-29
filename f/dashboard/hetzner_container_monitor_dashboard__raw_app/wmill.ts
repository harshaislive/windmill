export const backend = {
  async get_hetzner_monitor_dashboard(args: {
    days?: number
    project_key?: string
  }) {
    return (globalThis as any).wmill?.backend?.get_hetzner_monitor_dashboard
      ? (globalThis as any).wmill.backend.get_hetzner_monitor_dashboard(args)
      : Promise.reject(new Error('Windmill backend is only available in the raw app runtime'))
  },
}
