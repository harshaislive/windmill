export const backend = {
  async fetch_dashboard(args: {
    month?: string
    owner?: string
    status?: string
  }) {
    const workspace = 'beforest-automations'
    const path = encodeURIComponent('f/task_intelligence_system/fetch_dashboard_v2')
    const apiUrl = new URL(`/api/w/${workspace}/jobs/run_wait_result/p/${path}`, window.location.origin)
    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    return response.json()
  },
}
