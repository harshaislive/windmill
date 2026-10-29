import { JobService } from 'npm:windmill-client@1'

type ApprovedDocumentEvent = {
  event_type: string
  event_id?: string
  dropbox_file_id: string
  dropbox_path: string
  dropbox_revision?: string
  file_name: string
  file_size_bytes?: number
  knowledge_space?: string
  department?: string
  approval_status: string
  uploaded_by?: string
  uploaded_at?: string
}

const DROPBOX_ROOT = '/Apps/KMS-Documents (1)/'
const WORKSPACE = Deno.env.get('WM_WORKSPACE')
if (!WORKSPACE) throw new Error('WM_WORKSPACE is missing')

export async function main(
  event_type: string,
  approval_status: string,
  dropbox_file_id: string,
  dropbox_path: string,
  file_name: string,
  dropbox_revision?: string,
  event_id?: string,
  knowledge_space?: string,
  department?: string,
  uploaded_by?: string,
  uploaded_at?: string,
  file_size_bytes?: number,
) {
  const input: ApprovedDocumentEvent = {
    event_type,
    approval_status,
    dropbox_file_id,
    dropbox_path,
    file_name,
    dropbox_revision,
    event_id,
    knowledge_space,
    department,
    uploaded_by,
    uploaded_at,
    file_size_bytes,
  }

  if (!input?.event_type) throw new Error('event_type is required')

  const eventType = input.event_type.toLowerCase()
  if (eventType !== 'approved_document_uploaded' && eventType !== 'kms.document.uploaded') {
    throw new Error(`Unsupported event_type: ${input.event_type}`)
  }

  if (input.approval_status?.toLowerCase() !== 'approved') {
    throw new Error('Document is not approved')
  }

  if (!input.dropbox_file_id || !input.file_name || !input.dropbox_path) {
    throw new Error('Dropbox file ID, path, and file name are required')
  }

  const dropboxPath = input.dropbox_path.startsWith(DROPBOX_ROOT)
    ? input.dropbox_path
    : `${DROPBOX_ROOT}${input.dropbox_path.replace(/^\/+/, '')}`

  const jobId = await JobService.runScriptByPath({
    workspace: WORKSPACE,
    path: 'f/kms/download_approved_document',
    requestBody: {
      dropbox_path: dropboxPath,
      file_name: input.file_name,
      dropbox_file_id: input.dropbox_file_id,
      dropbox_revision: input.dropbox_revision,
      file_size_bytes: input.file_size_bytes,
      uploaded_by: input.uploaded_by,
      uploaded_at: input.uploaded_at,
    },
  })

  return {
    accepted: true,
    status: 'queued',
    job_id: jobId,
    event_id: input.event_id ?? null,
    dropbox_file_id: input.dropbox_file_id,
    dropbox_path: dropboxPath,
    knowledge_space: input.knowledge_space ?? input.department ?? null,
  }
}