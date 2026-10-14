export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = details.fields || {}
  }
}

async function apiRequest(path, { token = '', body, method = 'GET', signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    throw new ApiError(payload.error || '请求失败，请稍后再试。', response.status, payload)
  }

  return payload
}

function createGroupQuery({ query = '', page = 1, pageSize = 20 } = {}) {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (query.trim()) search.set('q', query.trim())
  return search.toString()
}

export function getPublicGroups(options = {}) {
  return apiRequest(`/api/groups?${createGroupQuery(options)}`, {
    signal: options.signal,
  })
}

export function getPageView(options = {}) {
  return apiRequest('/api/metrics/pv', { signal: options.signal })
}

export function trackPageView() {
  return apiRequest('/api/metrics/pv', { method: 'POST' })
}

export function loginAdmin(credentials) {
  return apiRequest('/api/auth/login', { method: 'POST', body: credentials })
}

export function logoutAdmin(token) {
  return apiRequest('/api/auth/logout', { method: 'POST', token })
}

export function getAdminGroups(token, options = {}) {
  return apiRequest(`/api/admin/groups?${createGroupQuery(options)}`, {
    token,
    signal: options.signal,
  })
}

export function createAdminGroup(token, group) {
  return apiRequest('/api/admin/groups', { method: 'POST', token, body: group })
}

export function updateAdminGroup(token, id, group) {
  return apiRequest(`/api/admin/groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token,
    body: group,
  })
}

export function deleteAdminGroup(token, id) {
  return apiRequest(`/api/admin/groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}
