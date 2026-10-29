export const backend = {
  async get_opex_data(args: {
    action?: "collectives" | "snapshots" | "dashboard" | "refresh" | "status" | "transactions";
    dashboard_passcode?: string;
    collective?: string;
    from?: string;
    to?: string;
    fiscal_year?: string;
    snapshot_run_id?: string;
    account_id?: string;
    category_key?: string;
    cost_center_labels?: string[];
    expected_actual?: number;
  }): Promise<any> {
    return (globalThis as any).wmill?.backend?.get_opex_data
      ? (globalThis as any).wmill.backend.get_opex_data(args)
      : Promise.reject(new Error("Windmill backend is only available in the raw app runtime"));
  },
};
