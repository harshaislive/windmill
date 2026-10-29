export const backend = {
  async fetch_water_dashboard(args: {
    date_from?: string;
    date_to?: string;
    source?: string;
    purpose?: string;
    record_type?: string;
    trend_mode?: string;
    dashboard_passcode?: string;
  }) {
    return (globalThis as any).wmill?.backend?.fetch_water_dashboard
      ? (globalThis as any).wmill.backend.fetch_water_dashboard(args)
      : Promise.reject(new Error("Windmill backend is only available in the raw app runtime"));
  },
};
