import * as wmill from 'windmill-client';
export async function main(rows: any[] = [], health: any = null, initialize: boolean = false) {
 const sql=wmill.datatable('main');
 if(initialize){
  await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_groups(group_key text PRIMARY KEY,pipeline_id integer NOT NULL,name text NOT NULL,owner_name text NOT NULL,status text NOT NULL,band text NOT NULL DEFAULT 'unscored',body jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`.execute();
  await sql`CREATE INDEX IF NOT EXISTS sales_intelligence_cohort ON sales_intelligence_groups(pipeline_id,status,band)`.execute();
  await sql`CREATE TABLE IF NOT EXISTS sales_intelligence_health(id text PRIMARY KEY,body jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`.execute();
 }
 if(rows.length>250)throw new Error('Maximum 250 groups per batch');
 for(const r of rows)if(![1,2,3].includes(r.pipeline_id)||!r.key?.startsWith(r.pipeline_id+':')||!['unscored','customer'].includes(r.band))throw new Error('Invalid snapshot scope or unreviewed priority');
 if(rows.length)await sql`INSERT INTO sales_intelligence_groups(group_key,pipeline_id,name,owner_name,status,band,body)
  SELECT v->>'key',(v->>'pipeline_id')::integer,v->>'name',v->>'owner_name',v->>'status',v->>'band',v
  FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS v
  ON CONFLICT(group_key) DO UPDATE SET pipeline_id=excluded.pipeline_id,name=excluded.name,owner_name=excluded.owner_name,
  status=excluded.status,band=excluded.band,body=excluded.body,updated_at=now()`.execute();
 if(health)await sql`INSERT INTO sales_intelligence_health(id,body) VALUES('backfill',${JSON.stringify(health)}::jsonb)
  ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=now()`.execute();
 const counts=await sql`SELECT pipeline_id,count(*)::integer count FROM sales_intelligence_groups GROUP BY pipeline_id ORDER BY pipeline_id`.fetch();
 return {imported:rows.length,counts};
}
