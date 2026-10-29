import { getVariable } from 'npm:windmill-client@1'

type Chunk = {
  chunk_index: number
  text: string
  [key: string]: unknown
}

const variable = (name: string) => getVariable(`f/kms/${name}`)

export async function main(
  chunks: Chunk[],
  file_name: string,
  dropbox_path: string,
  dropbox_file_id?: string,
  dropbox_revision?: string,
  department?: string,
  version?: string,
  uploaded_by?: string,
  uploaded_at?: string,
) {
  const apiKey = await variable('GEMINI_API_KEY')
  const configuredModel = (await variable('GEMINI_EMBEDDING_MODEL')) || 'gemini-embedding-001'
  const model = configuredModel.startsWith('models/') ? configuredModel.slice('models/'.length) : configuredModel
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('No chunks were provided')

  const embedded: Array<Record<string, unknown>> = []
  for (let start = 0; start < chunks.length; start += 64) {
    const batch = chunks.slice(start, start + 64)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: batch.map((chunk) => ({
          model: `models/${model}`,
          content: { parts: [{ text: chunk.text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        })),
      }),
    })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Gemini embeddings failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 500)}` : ''}`)
    }
    const data = await response.json() as { embeddings?: Array<{ values?: number[] }> }
    if (!data.embeddings || data.embeddings.length !== batch.length) throw new Error('Gemini returned an unexpected embedding count')
    for (let index = 0; index < data.embeddings.length; index++) {
      const values = data.embeddings[index].values
      if (!values?.length) throw new Error('Gemini returned an empty embedding')
      embedded.push({ ...batch[index], embedding: values })
    }
  }

  return {
    embedded: true,
    model,
    file_name,
    dropbox_path,
    dropbox_file_id: dropbox_file_id ?? null,
    dropbox_revision: dropbox_revision ?? null,
    department: department ?? null,
    version: version ?? null,
    owner_name: uploaded_by ?? null,
    uploaded_by: uploaded_by ?? null,
    uploaded_at: uploaded_at ?? null,
    chunk_count: embedded.length,
    embedding_dimensions: (embedded[0].embedding as number[]).length,
    chunks: embedded,
  }
}
