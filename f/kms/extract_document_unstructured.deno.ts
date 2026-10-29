import { getVariable } from 'npm:windmill-client@1'
import * as XLSX from 'npm:xlsx@0.18.5'

const variable = (name: string) => getVariable(`f/kms/${name}`)

type Element = {
  type?: string
  text?: string
  metadata?: Record<string, unknown>
}

function endpointFor(base: string) {
  const trimmed = base.replace(/\/$/, '')
  return trimmed.endsWith('/general') ? trimmed : `${trimmed}/general/v0/general`
}

function extensionFor(fileName: string) {
  return fileName.toLowerCase().split('.').pop() ?? ''
}

function mimeTypeFor(fileName: string) {
  switch (extensionFor(fileName)) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'csv':
      return 'text/csv'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

function isSpreadsheet(fileName: string) {
  return ['xlsx', 'xls', 'csv'].includes(extensionFor(fileName))
}

function extractSpreadsheetElements(bytes: Uint8Array, fileName: string) {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, dense: false })
  const elements: Array<{ type: string; text: string; page_number: null; section: string }> = []

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
    })

    rows.forEach((row, index) => {
      const cells = Object.entries(row)
        .map(([key, value]) => [key, String(value).replace(/\s+/g, ' ').trim()])
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => `${key}: ${value}`)

      if (cells.length > 0) {
        elements.push({
          type: 'TableRow',
          text: `Sheet ${sheetName}, row ${index + 2}: ${cells.join('; ')}`,
          page_number: null,
          section: sheetName,
        })
      }
    })
  }

  if (elements.length === 0) {
    throw new Error(`Spreadsheet extraction failed: no readable rows found in ${fileName}`)
  }

  return elements
}

export async function main(
  content_base64: string,
  file_name: string,
  dropbox_path: string,
  dropbox_file_id?: string,
  dropbox_revision?: string,
  department?: string,
  version?: string,
  uploaded_by?: string,
  uploaded_at?: string,
) {
  if (!content_base64) throw new Error('content_base64 is required')

  const binary = atob(content_base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  if (isSpreadsheet(file_name)) {
    const extracted = extractSpreadsheetElements(bytes, file_name)
    return {
      extracted: true,
      file_name,
      dropbox_path,
      dropbox_file_id: dropbox_file_id ?? null,
      dropbox_revision: dropbox_revision ?? null,
      department: department ?? null,
      version: version ?? null,
      owner_name: uploaded_by ?? null,
      uploaded_by: uploaded_by ?? null,
      uploaded_at: uploaded_at ?? null,
      element_count: extracted.length,
      elements: extracted,
    }
  }

  const apiUrl = await variable('UNSTRUCTURED_API_URL')
  const apiKey = await variable('UNSTRUCTURED_API_KEY').catch(() => '')
  if (!apiUrl) throw new Error('UNSTRUCTURED_API_URL is not configured')

  const form = new FormData()
  form.append('files', new Blob([bytes], { type: mimeTypeFor(file_name) }), file_name)
  form.append('strategy', 'auto')
  form.append('include_page_breaks', 'true')

  const headers: Record<string, string> = {}
  if (apiKey) headers['unstructured-api-key'] = apiKey
  const response = await fetch(endpointFor(apiUrl), { method: 'POST', headers, body: form })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Unstructured extraction failed: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 500)}` : ''}`)
  }

  const elements = await response.json() as Element[]
  const extracted = elements
    .map((element) => ({
      type: element.type ?? 'Unknown',
      text: (element.text ?? '').replace(/\s+/g, ' ').trim(),
      page_number: element.metadata?.page_number ?? null,
      section: element.metadata?.section ?? null,
    }))
    .filter((element) => element.text.length > 0)

  return {
    extracted: true,
    file_name,
    dropbox_path,
    dropbox_file_id: dropbox_file_id ?? null,
    dropbox_revision: dropbox_revision ?? null,
    department: department ?? null,
    version: version ?? null,
    element_count: extracted.length,
    elements: extracted,
  }
}
