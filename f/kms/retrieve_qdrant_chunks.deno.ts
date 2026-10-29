import { getVariable } from 'npm:windmill-client@1'

const variable = (name: string) => getVariable(`f/kms/${name}`)

export async function main(question: string, department?: string, limit = 5) {
  if (!question?.trim()) throw new Error('Question is required')
  const geminiKey = await variable('GEMINI_API_KEY')
  const configuredModel = String((await variable('GEMINI_EMBEDDING_MODEL')) || 'gemini-embedding-001').trim().replace(/^['"]|['"]$/g, '')
  const model = configuredModel.replace(/^models\//, '').split(':')[0].split('/').pop() || 'gemini-embedding-001'
  const qdrantUrl = (await variable('QDRANT_URL')).replace(/\/$/, '')
  const collection = (await variable('QDRANT_COLLECTION')) || 'kms_documents'
  const qdrantKey = await variable('QDRANT_API_KEY').catch(() => '')
  if (!geminiKey || !qdrantUrl) throw new Error('Gemini or Qdrant configuration is missing')

  const embeddingResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: question }] }, embedContentConfig: { taskType: 'RETRIEVAL_QUERY' } }),
  })
  if (!embeddingResponse.ok) {
    const detail = await embeddingResponse.text()
    throw new Error(`Gemini query embedding failed: HTTP ${embeddingResponse.status}${detail ? ` - ${detail.slice(0, 800)}` : ''}`)
  }
  const embedding = (await embeddingResponse.json()).embedding?.values
  if (!embedding?.length) throw new Error('Gemini returned an empty query embedding')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (qdrantKey) headers['api-key'] = qdrantKey
  const filter = department ? { must: [{ key: 'department', match: { value: department } }] } : undefined
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/query`, {
    method: 'POST', headers,
    body: JSON.stringify({ query: embedding, limit: Math.min(Math.max(limit, 1), 20), with_payload: true, filter }),
  })
  if (!response.ok) throw new Error(`Qdrant query failed: HTTP ${response.status}`)
  const data = await response.json()
  const points = Array.isArray(data.result)
    ? data.result
    : Array.isArray(data.result?.points)
      ? data.result.points
      : Array.isArray(data.result?.result?.points)
        ? data.result.result.points
        : []
  const documents = new Map<string, { file_name?: string; dropbox_path?: string; dropbox_file_id?: string; owner_name?: string; uploaded_by?: string; uploaded_at?: string }>()
  let offset: string | number | null = null
  do {
    const scrollResponse = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 1000, offset, with_payload: ['file_name', 'dropbox_path', 'dropbox_file_id', 'department', 'owner_name', 'uploaded_by', 'uploaded_at'], filter }),
    })
    if (!scrollResponse.ok) throw new Error(`Qdrant document count failed: HTTP ${scrollResponse.status}`)
    const scroll = await scrollResponse.json()
    const page = scroll.result?.points ?? []
    for (const point of page) {
      const payload = point.payload ?? {}
      const key = payload.dropbox_path ?? payload.file_name ?? String(point.id)
      documents.set(key, { file_name: payload.file_name, dropbox_path: payload.dropbox_path, dropbox_file_id: payload.dropbox_file_id, owner_name: payload.owner_name, uploaded_by: payload.uploaded_by, uploaded_at: payload.uploaded_at })
    }
    offset = scroll.result?.next_page_offset ?? null
  } while (offset !== null)

  return { retrieved: true, question, department: department ?? null, document_count: documents.size, documents: Array.from(documents.values()), matches: points.map((point: any) => ({ score: point.score, ...point.payload })) }
}
