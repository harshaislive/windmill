export const backend = {
  async fetch_manychat_dashboard() {
    return (globalThis as any).wmill?.backend?.fetch_manychat_dashboard
      ? (globalThis as any).wmill.backend.fetch_manychat_dashboard({})
      : Promise.reject(new Error("Windmill backend is only available in the raw app runtime"));
  },
};
