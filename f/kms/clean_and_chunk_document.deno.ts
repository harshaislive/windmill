import { getVariable } from 'npm:windmill-client@1'

type Element = {
  type?: string
  text: string
  page_number?: number | string | null
  section?: string | null
}

const variable = (name: string) => getVariable(`f/kms/${name}`)

export async function main(
  elements: Element[],
  file_name: string,
  dropbox_path: string,
  dropbox_file_id?: string,
  dropbox_revision?: string,
  department?: string,
  version?: string,
  uploaded_by?: string,
  uploaded_at?: string,
) {
  if (!Array.isArray(elements) || elements.length === 0) throw new Error('No extracted elements were provided')

  const chunkSize = Math.max(200, Number(await variable('CHUNK_SIZE')) || 1000)
  const overlap = Math.min(chunkSize - 1, Math.max(0, Number(await variable('CHUNK_OVERLAP')) || 150))
  const cleaned: Element[] = []
  const seen = new Set<string>()

  for (const element of elements) {
    const text = (element.text || '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!text) continue
    const fingerprint = text.toLowerCase()
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    cleaned.push({ ...element, text })
  }

  const chunks: Array<Record<string, unknown>> = []
  let current = ''
  let currentPage: number | string | null = null
  let currentSection: string | null = null

  const flush = () => {
    const text = current.trim()
    if (!text) return
    chunks.push({
      chunk_index: chunks.length,
      text,
      page_number: currentPage,
      section: currentSection,
      file_name,
      dropbox_path,
      dropbox_file_id: dropbox_file_id ?? null,
      dropbox_revision: dropbox_revision ?? null,
      department: department ?? null,
      version: version ?? null,
      owner_name: uploaded_by ?? null,
      uploaded_by: uploaded_by ?? null,
      uploaded_at: uploaded_at ?? null,
    })
  }

  for (const element of cleaned) {
    const text = element.text
    if (current && current.length + text.length + 2 > chunkSize) {
      flush()
      const tail = current.slice(Math.max(0, current.length - overlap)).trim()
      current = tail ? `${tail}\n\n${text}` : text
      currentPage = element.page_number ?? currentPage
      currentSection = element.section ?? currentSection
    } else {
      current = current ? `${current}\n\n${text}` : text
      currentPage = currentPage ?? element.page_number ?? null
      currentSection = currentSection ?? element.section ?? null
    }

    while (current.length > chunkSize * 1.5) {
      const splitAt = current.lastIndexOf(' ', chunkSize)
      const end = splitAt > Math.floor(chunkSize * 0.6) ? splitAt : chunkSize
      const piece = current.slice(0, end).trim()
      if (piece) chunks.push({ chunk_index: chunks.length, text: piece, page_number: currentPage, section: currentSection, file_name, dropbox_path, dropbox_file_id: dropbox_file_id ?? null, dropbox_revision: dropbox_revision ?? null, department: department ?? null, version: version ?? null, owner_name: uploaded_by ?? null, uploaded_by: uploaded_by ?? null, uploaded_at: uploaded_at ?? null })
      current = current.slice(Math.max(0, end - overlap)).trim()
    }
  }
  flush()

  return {
    cleaned: true,
    chunked: true,
    file_name,
    dropbox_path,
    department: department ?? null,
    owner_name: uploaded_by ?? null,
    uploaded_by: uploaded_by ?? null,
    uploaded_at: uploaded_at ?? null,
    source_elements: elements.length,
    cleaned_elements: cleaned.length,
    chunk_count: chunks.length,
    chunks,
  }
}
