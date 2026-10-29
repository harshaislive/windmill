import * as wmill from "windmill-client";

export async function main(department = "", period = "", fiscal_year = "") {
  const sql = wmill.datatable("main");
  const fiscalYearRows = await sql`SELECT DISTINCT fiscal_year FROM ho_expense_snapshots ORDER BY fiscal_year DESC`.fetch();
  const fiscalYears = fiscalYearRows.map((row: any) => String(row.fiscal_year));
  const selectedFiscalYear = fiscal_year || fiscalYears[0] || "FY 2026–27";
  const departments = await sql`SELECT department FROM ho_expense_departments WHERE active = TRUE ORDER BY department`.fetch();
  const selectedDepartment = department || String(departments[0]?.department || "");
  const months = await sql`SELECT period_key, report_from, report_to, data_status, synced_at
    FROM ho_expense_snapshots WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear}
    ORDER BY period_key`.fetch();
  const selectedPeriod = period || String(months[months.length - 1]?.period_key || "");
  const snapshot = selectedPeriod
    ? await sql`SELECT payload, data_status, synced_at FROM ho_expense_snapshots
        WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear} AND period_key = ${selectedPeriod}`.fetchOne()
    : null;
  const ytd = await sql`SELECT payload, report_to, synced_at FROM ho_expense_ytd_categories
    WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear}`.fetchOne();
  const referenceBudget = Number(ytd?.payload?.monthlyBudgets?.[selectedPeriod] || 0);
  const hasReferenceBudget = ytd?.payload?.budgetStatus === "configured" && referenceBudget > 0;
  const selectedSnapshot = snapshot?.payload
    ? {
      ...snapshot.payload,
      categories: ytd?.payload?.categories || snapshot.payload.categories,
      categoryScope: ytd?.payload?.categoryScope || snapshot.payload.categoryScope,
      budgetStatus: hasReferenceBudget
        ? "configured"
        : ytd?.payload?.budgetStatus === "sync_pending" ? "sync_pending" : "not_configured_for_period",
      metrics: {
        ...snapshot.payload.metrics,
        budget: hasReferenceBudget ? referenceBudget : null,
        variance: hasReferenceBudget ? referenceBudget - Number(snapshot.payload.metrics?.actual || 0) : null,
        utilization: hasReferenceBudget ? Number(snapshot.payload.metrics?.actual || 0) / referenceBudget : null,
        activeCategories: ytd?.payload?.activeCategories ?? snapshot.payload.metrics?.activeCategories,
      },
    }
    : null;
  const historyRows = await sql`SELECT period_key, payload, data_status, synced_at
    FROM ho_expense_snapshots WHERE department = ${selectedDepartment} AND fiscal_year = ${selectedFiscalYear}
    ORDER BY period_key`.fetch();
  return {
    departments: departments.map((row: any) => String(row.department)),
    months: months.map((row: any) => ({ key: String(row.period_key), from: row.report_from, to: row.report_to, dataStatus: row.data_status, syncedAt: row.synced_at })),
    fiscalYears, selectedFiscalYear, selectedDepartment, selectedPeriod, snapshot: selectedSnapshot,
    history: historyRows.map((row: any) => {
      const key = String(row.period_key);
      const budget = Number(ytd?.payload?.monthlyBudgets?.[key] || 0);
      const hasBudget = ytd?.payload?.budgetStatus === "configured" && budget > 0;
      const actual = Number(row.payload?.metrics?.actual || 0);
      return {
        periodKey: key,
        metrics: row.payload?.metrics ? {
          ...row.payload.metrics,
          budget: hasBudget ? budget : null,
          variance: hasBudget ? budget - actual : null,
          utilization: hasBudget ? actual / budget : null,
        } : null,
        period: row.payload?.period || null,
        dataStatus: row.data_status,
        syncedAt: row.synced_at,
      };
    }),
    dataStatus: snapshot?.data_status || "no_data", syncedAt: snapshot?.synced_at || null,
  };
}
