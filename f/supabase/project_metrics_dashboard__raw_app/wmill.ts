export const backend = {
  async get_metrics(args: { limit?: number; project_key?: string }) {
    return (globalThis as any).wmill?.backend?.get_metrics
      ? (globalThis as any).wmill.backend.get_metrics(args)
      : Promise.reject(new Error('Windmill backend is only available in the raw app runtime'))
  },
}
