import postgres from 'npm:postgres@3'
import { getVariable } from 'npm:windmill-client@1'

const variable = (name: string) => getVariable(`f/kms/${name}`)

function clean(value?: string | null) {
  const next = value?.trim()
  return next && next.length > 0 ? next : null
}

export async function main(dropbox_path?: string, file_name?: string, dropbox_file_id?: string) {
  const dropboxPath = clean(dropbox_path)
  const fileName = clean(file_name)
  const dropboxFileId = clean(dropbox_file_id)
  if (!dropboxPath && !fileName && !dropboxFileId) {
    throw new Error('dropbox_path, file_name, or dropbox_file_id is required')
  }

  const qdrantUrl = (await variable('QDRANT_URL')).replace(/\/$/, '')
  const collection = (await variable('QDRANT_COLLECTION')) || 'kms_documents'
  const apiKey = await variable('QDRANT_API_KEY').catch(() => '')
  if (!qdrantUrl) throw new Error('QDRANT_URL is not configured')

  const conditions = [
    dropboxPath ? { key: 'dropbox_path', match: { value: dropboxPath } } : null,
    fileName ? { key: 'file_name', match: { value: fileName } } : null,
    dropboxFileId ? { key: 'dropbox_file_id', match: { value: dropboxFileId } } : null,
  ].filter(Boolean)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['api-key'] = apiKey

  const deleteResponse = await fetch(qdrantUrl + '/collections/' + encodeURIComponent(collection) + '/points/delete?wait=true', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filter: conditions.length === 1 ? { must: conditions } : { should: conditions },
    }),
  })
  if (!deleteResponse.ok) {
    const detail = await deleteResponse.text()
    throw new Error('Qdrant delete failed: HTTP ' + deleteResponse.status + (detail ? ' - ' + detail.slice(0, 500) : ''))
  }
  const deleteResult = await deleteResponse.json()

  let postgresUpdated = 0
  const databaseUrl = await variable('DATABASE_URL').catch(() => '')
  if (databaseUrl) {
    const sql = postgres(databaseUrl, { max: 1 })
    try {
      const updates = await sql`
        UPDATE kms_document_processing
        SET status = 'DELETED', updated_at = NOW()
        WHERE (${dropboxPath}::text IS NOT NULL AND dropbox_path = ${dropboxPath})
           OR (${fileName}::text IS NOT NULL AND file_name = ${fileName})
           OR (${dropboxFileId}::text IS NOT NULL AND dropbox_file_id = ${dropboxFileId})
      `
      postgresUpdated = updates.count ?? 0
    } finally {
      await sql.end({ timeout: 5 })
    }
  }

  return {
    deleted: true,
    collection,
    qdrant_status: deleteResult.status ?? 'ok',
    postgres_updated: postgresUpdated,
    dropbox_untouched: true,
  }
}