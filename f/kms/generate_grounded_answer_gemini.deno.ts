import { getVariable } from 'npm:windmill-client@1'

type Match = { score?: number; text?: string; file_name?: string; dropbox_path?: string; dropbox_file_id?: string; page_number?: number | string | null; section?: string | null }
const variable = (name: string) => getVariable(`f/kms/${name}`)

export async function main(question: string, matches: Match[], document_count?: number, documents: Match[] = [], system_prompt?: string) {
  if (!question?.trim()) throw new Error('Question is required')
  if (!matches?.length) return { answered: false, answer: 'I could not find this information in the approved knowledge base.', citations: [] }
  const apiKey = await variable('OPENROUTER_API_KEY')
  const model = await variable('OPENROUTER_MODEL')
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')
  if (!model) throw new Error('OPENROUTER_MODEL is not configured')
  const context = matches.map((match, index) => `[Source ${index + 1}]\n${match.text}\nFile: ${match.file_name ?? 'Unknown'}\nPath: ${match.dropbox_path ?? 'Unknown'}\nPage: ${match.page_number ?? 'Unknown'}\nSection: ${match.section ?? 'Unknown'}`).join('\n\n')
  const asksForCount = /\b(how many|number of|count|documents do we have|how much documents)\b/i.test(question)
  const inventory = asksForCount && typeof document_count === 'number' ? `The approved knowledge base currently contains ${document_count} unique document(s). Use this number when answering the user's document-count question.\n\n` : ''
  const defaultSystemPrompt = "You are Ask Beforest, a clear and helpful internal knowledge assistant for Beforest.\n\nAnswer the user's question using only the approved knowledge excerpts below.\n\nResponse style:\n- Be direct, natural, and professional.\n- Start with the answer, not with caveats.\n- Use short paragraphs.\n- Use bullet points when the information has multiple items.\n- Explain internal terms simply.\n- Do not sound robotic.\n- Do not mention the excerpts, retrieved chunks, context, Qdrant, Windmill, OpenRouter, or backend systems.\n- Do not use citation markers like [Source 1]; the app shows sources separately.\n- If the answer is not present in the approved knowledge, say: \"I couldn't find that in the approved knowledge base.\"\n\nAccuracy rules:\n- Use only the information present in the approved knowledge excerpts.\n- Do not invent facts.\n- Do not add external knowledge.\n- If the data is incomplete, say what is available and what is missing."
  const responseGuide = system_prompt?.trim() || defaultSystemPrompt
  const prompt = `${responseGuide}\n\n${inventory}Question: ${question}\n\nApproved knowledge:\n${context}`
  const openrouterBaseUrl = (await variable('OPENROUTER_BASE_URL').catch(() => '')) || 'https://openrouter.ai/api/v1/chat/completions'
  const response = await fetch(openrouterBaseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: responseGuide }, { role: 'user', content: `${inventory}Question: ${question}\n\nApproved knowledge:\n${context}` }] }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`OpenRouter answer generation failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 500)}` : ''}`)
  }
  const data = await response.json()
  const answer = typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content.trim() : ''
  const appKey = await variable('DROPBOX_APP_KEY').catch(() => '')
  const appSecret = await variable('DROPBOX_APP_SECRET').catch(() => '')
  const refreshToken = await variable('DROPBOX_REFRESH_TOKEN').catch(() => '')
  let accessToken = ''
  if (appKey && appSecret && refreshToken) {
    const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${appKey}:${appSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }) })
    if (tokenResponse.ok) accessToken = (await tokenResponse.json()).access_token
  }
  const citations = []
  const seenSources = new Set<string>()
  const citationMatches = asksForCount && documents.length ? documents : matches
  for (let index = 0; index < citationMatches.length; index++) {
    const match = citationMatches[index] as Match & { dropbox_file_id?: string }
    const sourceKey = match.dropbox_file_id ?? match.dropbox_path ?? match.file_name ?? `source-${index}`
    if (seenSources.has(sourceKey)) continue
    seenSources.add(sourceKey)
    let url: string | null = null
    if (accessToken && match.dropbox_file_id) {
      const linkResponse = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: match.dropbox_file_id }) })
      if (linkResponse.ok) url = (await linkResponse.json()).link ?? null
    }
    citations.push({ source: index + 1, file_name: match.file_name, dropbox_path: match.dropbox_path, page_number: match.page_number, section: match.section, url })
  }
  return { answered: Boolean(answer), answer: answer || 'I could not generate an answer from the approved knowledge base.', citations }
}
