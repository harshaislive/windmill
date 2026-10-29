import * as wmill from "windmill-client";

type WaterRecord = {
  id: string;
  date: string;
  date_key: string;
  month: string;
  borewell: string;
  borewell_pump: string;
  start_reading: number;
  end_reading: number;
  litres: number;
  groundwater_extracted_l: number;
  consumed_l: number;
  hours: number;
  purpose: string;
  terrace_block: string;
  crop: string;
  remarks: string;
  record_type: string;
  source_file: string;
};

type RainfallRecord = {
  id: string;
  date: string;
  date_key: string;
  month: string;
  rainfall_inches: number;
  cumulative_rainfall_inches: number;
  rainfall_mm: number;
  cumulative_rainfall_mm: number;
  lake: string;
};

async function ensureTables(sql: ReturnType<typeof wmill.datatable>) {
  await sql`
    CREATE TABLE IF NOT EXISTS water_usage_records (
      id TEXT PRIMARY KEY,
      date DATE,
      date_key TEXT,
      month TEXT,
      borewell TEXT,
      borewell_pump TEXT,
      start_reading DOUBLE PRECISION,
      end_reading DOUBLE PRECISION,
      litres DOUBLE PRECISION,
      groundwater_extracted_l DOUBLE PRECISION,
      consumed_l DOUBLE PRECISION,
      hours DOUBLE PRECISION,
      purpose TEXT,
      terrace_block TEXT,
      crop TEXT,
      remarks TEXT,
      record_type TEXT,
      source_file TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_water_usage_records_date ON water_usage_records(date);
    CREATE INDEX IF NOT EXISTS idx_water_usage_records_record_type ON water_usage_records(record_type);
    CREATE INDEX IF NOT EXISTS idx_water_usage_records_purpose ON water_usage_records(purpose);
    CREATE INDEX IF NOT EXISTS idx_water_usage_records_borewell ON water_usage_records(borewell);
  `.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS rainfall_records (
      id TEXT PRIMARY KEY,
      date DATE,
      date_key TEXT,
      month TEXT,
      rainfall_inches DOUBLE PRECISION,
      cumulative_rainfall_inches DOUBLE PRECISION,
      rainfall_mm DOUBLE PRECISION,
      cumulative_rainfall_mm DOUBLE PRECISION,
      lake TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_rainfall_records_date ON rainfall_records(date);
  `.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS water_dashboard_import_log (
      id BIGSERIAL PRIMARY KEY,
      import_date TIMESTAMPTZ DEFAULT NOW(),
      source_name TEXT,
      records_imported INTEGER,
      status TEXT,
      error_message TEXT,
      triggered_by TEXT,
      raw_summary JSONB
    )
  `.execute();
}

function chunk<T>(rows: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) batches.push(rows.slice(index, index + size));
  return batches;
}

async function upsertWater(sql: ReturnType<typeof wmill.datatable>, rows: WaterRecord[]) {
  for (const batch of chunk(rows, 500)) {
    await sql`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${batch}::jsonb) AS r(
          id TEXT,
          date TEXT,
          date_key TEXT,
          month TEXT,
          borewell TEXT,
          borewell_pump TEXT,
          start_reading DOUBLE PRECISION,
          end_reading DOUBLE PRECISION,
          litres DOUBLE PRECISION,
          groundwater_extracted_l DOUBLE PRECISION,
          consumed_l DOUBLE PRECISION,
          hours DOUBLE PRECISION,
          purpose TEXT,
          terrace_block TEXT,
          crop TEXT,
          remarks TEXT,
          record_type TEXT,
          source_file TEXT
        )
      )
      INSERT INTO water_usage_records (
        id, date, date_key, month, borewell, borewell_pump, start_reading, end_reading, litres,
        groundwater_extracted_l, consumed_l, hours, purpose, terrace_block, crop, remarks, record_type, source_file
      )
      SELECT
        id, NULLIF(date, '')::date, date_key, month, borewell, borewell_pump, start_reading, end_reading, litres,
        groundwater_extracted_l, consumed_l, hours, purpose, terrace_block, crop, remarks, record_type, source_file
      FROM incoming
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date,
        date_key = EXCLUDED.date_key,
        month = EXCLUDED.month,
        borewell = EXCLUDED.borewell,
        borewell_pump = EXCLUDED.borewell_pump,
        start_reading = EXCLUDED.start_reading,
        end_reading = EXCLUDED.end_reading,
        litres = EXCLUDED.litres,
        groundwater_extracted_l = EXCLUDED.groundwater_extracted_l,
        consumed_l = EXCLUDED.consumed_l,
        hours = EXCLUDED.hours,
        purpose = EXCLUDED.purpose,
        terrace_block = EXCLUDED.terrace_block,
        crop = EXCLUDED.crop,
        remarks = EXCLUDED.remarks,
        record_type = EXCLUDED.record_type,
        source_file = EXCLUDED.source_file,
        updated_at = NOW()
    `.execute();
  }
}

async function upsertRainfall(sql: ReturnType<typeof wmill.datatable>, rows: RainfallRecord[]) {
  for (const batch of chunk(rows, 500)) {
    await sql`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${batch}::jsonb) AS r(
          id TEXT,
          date TEXT,
          date_key TEXT,
          month TEXT,
          rainfall_inches DOUBLE PRECISION,
          cumulative_rainfall_inches DOUBLE PRECISION,
          rainfall_mm DOUBLE PRECISION,
          cumulative_rainfall_mm DOUBLE PRECISION,
          lake TEXT
        )
      )
      INSERT INTO rainfall_records (
        id, date, date_key, month, rainfall_inches, cumulative_rainfall_inches, rainfall_mm, cumulative_rainfall_mm, lake
      )
      SELECT
        id, NULLIF(date, '')::date, date_key, month, rainfall_inches, cumulative_rainfall_inches, rainfall_mm, cumulative_rainfall_mm, lake
      FROM incoming
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date,
        date_key = EXCLUDED.date_key,
        month = EXCLUDED.month,
        rainfall_inches = EXCLUDED.rainfall_inches,
        cumulative_rainfall_inches = EXCLUDED.cumulative_rainfall_inches,
        rainfall_mm = EXCLUDED.rainfall_mm,
        cumulative_rainfall_mm = EXCLUDED.cumulative_rainfall_mm,
        lake = EXCLUDED.lake,
        updated_at = NOW()
    `.execute();
  }
}

export async function main(
  water_records: WaterRecord[] = [],
  rainfall_records: RainfallRecord[] = [],
  reset = true,
  triggered_by = "manual_csv_backfill",
) {
  const sql = wmill.datatable("main");
  await ensureTables(sql);

  if (reset) {
    await sql`TRUNCATE TABLE water_usage_records, rainfall_records`.execute();
  }

  await upsertWater(sql, water_records);
  await upsertRainfall(sql, rainfall_records);

  await sql`
    INSERT INTO water_dashboard_import_log (source_name, records_imported, status, triggered_by, raw_summary)
    VALUES (
      ${"local_csv_snapshot"},
      ${water_records.length + rainfall_records.length},
      ${"success"},
      ${triggered_by},
      ${{
        water_records: water_records.length,
        rainfall_records: rainfall_records.length,
        reset,
      }}::jsonb
    )
  `.execute();

  return {
    status: "success",
    water_records: water_records.length,
    rainfall_records: rainfall_records.length,
    reset,
  };
}
