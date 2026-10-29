import { getVariable } from 'npm:windmill-client@1'

export async function main(source: string) {
  if (!source?.trim()) throw new Error('Document source is required')
  const key = await getVariable('f/kms/DROPBOX_APP_KEY')
  const secret = await getVariable('f/kms/DROPBOX_APP_SECRET')
  const refresh = await getVariable('f/kms/DROPBOX_REFRESH_TOKEN')
  const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  })
  if (!tokenResponse.ok) throw new Error('Dropbox authentication failed')
  const { access_token } = await tokenResponse.json()
  const linkResponse = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
    method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: source }),
  })
  if (!linkResponse.ok) throw new Error('Dropbox document was not found')
  return await linkResponse.json()
}
