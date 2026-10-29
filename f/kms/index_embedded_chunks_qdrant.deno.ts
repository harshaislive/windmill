import { getVariable } from 'npm:windmill-client@1'

type Chunk = {
  chunk_index: number
  text: string
  embedding?: number[]
  [key: string]: unknown
}

const variable = (name: string) => getVariable(`f/kms/${name}`)

async function pointId(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function main(
  chunks: Chunk[],
  file_name: string,
  dropbox_path: string,
  dropbox_file_id?: string,
  dropbox_revision?: string,
  department?: string,
  version?: string,
  content_hash?: string,
  uploaded_by?: string,
  uploaded_at?: string,
) {
  const qdrantUrl = (await variable('QDRANT_URL')).replace(/\/$/, '')
  const collection = (await variable('QDRANT_COLLECTION')) || 'kms_documents'
  const apiKey = await variable('QDRANT_API_KEY').catch(() => '')
  if (!qdrantUrl) throw new Error('QDRANT_URL is not configured')
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('No embedded chunks were provided')

  if (!chunks[0].embedding) {
    const geminiKey = await variable('GEMINI_API_KEY')
    const configuredModel = (await variable('GEMINI_EMBEDDING_MODEL')) || 'gemini-embedding-001'
    const embeddingModel = configuredModel.startsWith('models/') ? configuredModel.slice('models/'.length) : configuredModel
    if (!geminiKey) throw new Error('GEMINI_API_KEY is not configured')
    for (let start = 0; start < chunks.length; start += 64) {
      const batch = chunks.slice(start, start + 64)
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(embeddingModel)}:batchEmbedContents`, {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: batch.map((chunk) => ({ model: `models/${embeddingModel}`, content: { parts: [{ text: chunk.text }] }, taskType: 'RETRIEVAL_DOCUMENT' })) }),
      })
      if (!response.ok) throw new Error(`Gemini embeddings failed: HTTP ${response.status}`)
      const data = await response.json() as { embeddings?: Array<{ values?: number[] }> }
      if (!data.embeddings || data.embeddings.length !== batch.length) throw new Error('Gemini returned an unexpected embedding count')
      for (let index = 0; index < batch.length; index++) batch[index].embedding = data.embeddings[index].values
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['api-key'] = apiKey
  const request = async (path: string, init: RequestInit = {}) => fetch(`${qdrantUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })

  const firstDimension = chunks[0].embedding?.length
  if (!firstDimension) throw new Error('First chunk has no embedding')
  const collectionResponse = await request(`/collections/${encodeURIComponent(collection)}`)
  if (collectionResponse.status === 404) {
    const createResponse = await request(`/collections/${encodeURIComponent(collection)}`, { method: 'PUT', body: JSON.stringify({ vectors: { size: firstDimension, distance: 'Cosine' } }) })
    if (!createResponse.ok) throw new Error(`Qdrant collection creation failed: HTTP ${createResponse.status}`)
  } else if (!collectionResponse.ok) {
    throw new Error(`Qdrant collection check failed: HTTP ${collectionResponse.status}`)
  }

  const points = []
  for (const chunk of chunks) {
    if (!chunk.embedding?.length) throw new Error(`Chunk ${chunk.chunk_index} has no embedding`)
    const id = await pointId(`${dropbox_file_id ?? dropbox_path}:${dropbox_revision ?? content_hash ?? 'latest'}:${chunk.chunk_index}`)
    points.push({
      id,
      vector: chunk.embedding,
      payload: {
        text: chunk.text,
        chunk_index: chunk.chunk_index,
        file_name,
        dropbox_path,
        dropbox_file_id: dropbox_file_id ?? null,
        dropbox_revision: dropbox_revision ?? null,
        department: department ?? null,
        version: version ?? null,
        content_hash: content_hash ?? null,
        owner_name: uploaded_by ?? null,
        uploaded_by: uploaded_by ?? null,
        uploaded_at: uploaded_at ?? null,
        page_number: chunk.page_number ?? null,
        section: chunk.section ?? null,
      },
    })
  }

  const upsertResponse = await request(`/collections/${encodeURIComponent(collection)}/points?wait=true`, { method: 'PUT', body: JSON.stringify({ points }) })
  if (!upsertResponse.ok) {
    const detail = await upsertResponse.text()
    throw new Error(`Qdrant upsert failed: HTTP ${upsertResponse.status}${detail ? ` - ${detail.slice(0, 500)}` : ''}`)
  }
  const result = await upsertResponse.json()
  return { indexed: true, collection, point_count: points.length, vector_dimensions: firstDimension, status: result.status ?? 'completed' }
}
