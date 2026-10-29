import { getVariable } from 'npm:windmill-client@1'

type Input = {
  dropbox_file_id?: string
  dropbox_path: string
  file_name: string
  dropbox_revision?: string
  file_size_bytes?: number
  uploaded_by?: string
  uploaded_at?: string
}

const ROOT = '/Apps/KMS-Documents (1)/'
const variable = (name: string) => getVariable(`f/kms/${name}`)

export async function main(
  dropbox_path: string,
  file_name: string,
  dropbox_file_id?: string,
  dropbox_revision?: string,
  file_size_bytes?: number,
  uploaded_by?: string,
  uploaded_at?: string,
) {
  const input: Input = { dropbox_path, file_name, dropbox_file_id, dropbox_revision, file_size_bytes, uploaded_by, uploaded_at }
  const appKey = await variable('DROPBOX_APP_KEY')
  const appSecret = await variable('DROPBOX_APP_SECRET')
  const refreshToken = await variable('DROPBOX_REFRESH_TOKEN')
  const maxMb = Number(await variable('DROPBOX_MAX_FILE_SIZE_MB')) || 100

  if (!appKey || !appSecret || !refreshToken) throw new Error('Dropbox credentials are not configured')

  const path = input.dropbox_path.startsWith(ROOT)
    ? input.dropbox_path
    : `${ROOT}${input.dropbox_path.replace(/^\/+/, '')}`

  const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${appKey}:${appSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!tokenResponse.ok) throw new Error(`Dropbox token refresh failed: HTTP ${tokenResponse.status}`)
  const { access_token: accessToken } = await tokenResponse.json()

  const downloadTarget = input.dropbox_file_id || path
  const downloadResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: downloadTarget }),
    },
  })
  if (!downloadResponse.ok) {
    const detail = await downloadResponse.text()
    throw new Error(`Dropbox download failed: HTTP ${downloadResponse.status}${detail ? ` - ${detail.slice(0, 500)}` : ''}`)
  }

  const contentLength = Number(downloadResponse.headers.get('content-length') || 0)
  if (contentLength > maxMb * 1024 * 1024) throw new Error(`Document exceeds ${maxMb} MB limit`)
  const bytes = new Uint8Array(await downloadResponse.arrayBuffer())
  if (bytes.byteLength > maxMb * 1024 * 1024) throw new Error(`Document exceeds ${maxMb} MB limit`)

  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }

  return {
    downloaded: true,
    file_name: input.file_name,
    dropbox_path: path,
    dropbox_file_id: input.dropbox_file_id ?? null,
    dropbox_revision: input.dropbox_revision ?? null,
    size_bytes: bytes.byteLength,
    uploaded_by: input.uploaded_by ?? null,
    uploaded_at: input.uploaded_at ?? null,
    content_base64: btoa(binary),
  }
}
