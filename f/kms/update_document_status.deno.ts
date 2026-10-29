import postgres from 'npm:postgres@3'
import { getVariable } from 'npm:windmill-client@1'

const variable = (name: string) => getVariable(`f/kms/${name}`)

export async function main(
  status: string,
  file_name: string,
  dropbox_path: string,
  dropbox_file_id?: string,
  dropbox_revision?: string,
  department?: string,
  version?: string,
  content_hash?: string,
  chunk_count?: number,
  error_message?: string,
  uploaded_by?: string,
  uploaded_at?: string,
) {
  const databaseUrl = await variable('DATABASE_URL')
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured')

  const sql = postgres(databaseUrl, { max: 1 })
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS kms_document_processing (
        document_key TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        dropbox_path TEXT NOT NULL,
        dropbox_file_id TEXT,
        dropbox_revision TEXT,
        department TEXT,
        version TEXT,
        content_hash TEXT,
        status TEXT NOT NULL,
        chunk_count INTEGER,
        error_message TEXT,
        uploaded_by TEXT,
        uploaded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ready_at TIMESTAMPTZ
      )
    `
    await sql`ALTER TABLE kms_document_processing ADD COLUMN IF NOT EXISTS uploaded_by TEXT`
    await sql`ALTER TABLE kms_document_processing ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ`

    const documentKey = `${dropbox_file_id ?? dropbox_path}:${dropbox_revision ?? content_hash ?? 'latest'}`
    const readyAt = status === 'READY' ? new Date() : null
    await sql`
      INSERT INTO kms_document_processing (
        document_key, file_name, dropbox_path, dropbox_file_id, dropbox_revision,
        department, version, content_hash, status, chunk_count, error_message, uploaded_by, uploaded_at, ready_at
      ) VALUES (
        ${documentKey}, ${file_name}, ${dropbox_path}, ${dropbox_file_id ?? null}, ${dropbox_revision ?? null},
        ${department ?? null}, ${version ?? null}, ${content_hash ?? null}, ${status}, ${chunk_count ?? null}, ${error_message ?? null}, ${uploaded_by ?? null}, ${uploaded_at ?? null}, ${readyAt}
      )
      ON CONFLICT (document_key) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        dropbox_path = EXCLUDED.dropbox_path,
        dropbox_file_id = EXCLUDED.dropbox_file_id,
        dropbox_revision = EXCLUDED.dropbox_revision,
        department = EXCLUDED.department,
        version = EXCLUDED.version,
        content_hash = EXCLUDED.content_hash,
        status = EXCLUDED.status,
        chunk_count = EXCLUDED.chunk_count,
        error_message = EXCLUDED.error_message,
        uploaded_by = EXCLUDED.uploaded_by,
        uploaded_at = EXCLUDED.uploaded_at,
        updated_at = NOW(),
        ready_at = EXCLUDED.ready_at
    `

    return { saved: true, document_key: documentKey, status }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
