import * as wmill from 'windmill-client';

const CATEGORIES = ['Bewild', 'Sales Sprint', 'Finance', 'Liaisoning', 'CDS', 'Regolith', 'Collective Ops', 'Other'];
const COMPLEXITIES = ['Low', 'Medium', 'High'];

export async function main(zoho_task_id: string, category: string | null = null, complexity: string | null = null) {
  if (!/^\d{10,30}$/.test(zoho_task_id || '')) throw new Error('Invalid Zoho task ID.');
  if (category !== null && !CATEGORIES.includes(category)) throw new Error('Invalid category.');
  if (complexity !== null && !COMPLEXITIES.includes(complexity)) throw new Error('Invalid complexity.');

  const sql = wmill.datatable('main');
  await sql`CREATE TABLE IF NOT EXISTS task_intel_board_corrections (
    zoho_task_id text PRIMARY KEY,
    category text,
    complexity text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (category IS NULL OR category IN ('Bewild','Sales Sprint','Finance','Liaisoning','CDS','Regolith','Collective Ops','Other')),
    CHECK (complexity IS NULL OR complexity IN ('Low','Medium','High'))
  )`.execute();

  const task = await sql`SELECT t.zoho_task_id, t.title FROM task_intel_tasks t
    WHERE t.zoho_task_id = ${zoho_task_id}
      AND lower(coalesce(t.status,'')) NOT IN ('closed','done','completed','cancelled','canceled')
      AND EXISTS (SELECT 1 FROM task_intel_task_owners o WHERE o.task_id=t.id
        AND lower(o.owner_name) IN ('mudumba sesha sai','harsha mudumba','soundharya somaraju','shivathmika racharla'))`.fetchOne() as {zoho_task_id:string;title:string}|undefined;
  if (!task) throw new Error('This task is not on the open team board.');

  if (category === null && complexity === null) {
    await sql`DELETE FROM task_intel_board_corrections WHERE zoho_task_id=${zoho_task_id}`.execute();
  } else {
    await sql`INSERT INTO task_intel_board_corrections (zoho_task_id,category,complexity,updated_at)
      VALUES (${zoho_task_id},${category},${complexity},now())
      ON CONFLICT (zoho_task_id) DO UPDATE SET category=excluded.category,complexity=excluded.complexity,updated_at=now()`.execute();
  }
  const saved = await sql`SELECT zoho_task_id,category,complexity,updated_at
    FROM task_intel_board_corrections WHERE zoho_task_id=${zoho_task_id}`.fetchOne();
  return {ok:true,task:task.title,correction:saved ?? null};
}
