export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = details.code || ''
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

function createGroupQuery({ query = '', page = 1, pageSize = 20, status = '' } = {}) {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (query.trim()) search.set('q', query.trim())
  if (status) search.set('status', status)
  return search.toString()
}

export function getPublicGroups(options = {}) {
  return apiRequest(`/api/groups?${createGroupQuery(options)}`, {
    signal: options.signal,
  })
}

export function checkGroupApplicationQq(qq, options = {}) {
  const search = new URLSearchParams({ qq: String(qq).trim() })
  return apiRequest(`/api/group-applications/check?${search}`, {
    signal: options.signal,
  })
}

export function createGroupApplication(application) {
  return apiRequest('/api/group-applications', {
    method: 'POST',
    body: application,
  })
}

export function getPublicActivities(options = {}) {
  return apiRequest(`/api/activities?${createGroupQuery(options)}`, {
    signal: options.signal,
  })
}

export function createActivityApplication(application) {
  return apiRequest('/api/activity-applications', {
    method: 'POST',
    body: application,
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

export function getAdminApplications(token, options = {}) {
  return apiRequest(`/api/admin/applications?${createGroupQuery(options)}`, {
    token,
    signal: options.signal,
  })
}

export function updateAdminApplication(token, id, application) {
  return apiRequest(`/api/admin/applications/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token,
    body: application,
  })
}

export function reviewAdminApplication(token, id, decision) {
  return apiRequest(
    `/api/admin/applications/${encodeURIComponent(id)}/${decision}`,
    { method: 'POST', token },
  )
}

export function getAdminActivities(token, options = {}) {
  return apiRequest(`/api/admin/activities?${createGroupQuery(options)}`, {
    token,
    signal: options.signal,
  })
}

export function createAdminActivity(token, activity) {
  return apiRequest('/api/admin/activities', {
    method: 'POST',
    token,
    body: activity,
  })
}

export async function uploadAdminActivityImage(token, image) {
  const response = await fetch('/api/admin/activity-images', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': image.type || 'application/octet-stream',
    },
    body: image,
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    throw new ApiError(payload.error || '图片上传失败，请稍后再试。', response.status, payload)
  }

  return payload
}

export function deleteAdminActivityImage(token, imageUrl) {
  const filename = String(imageUrl).split('/').pop()
  return apiRequest(`/api/admin/activity-images/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    token,
  })
}

export function updateAdminActivity(token, id, activity) {
  return apiRequest(`/api/admin/activities/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token,
    body: activity,
  })
}

export function setAdminActivityPinned(token, id, pinned) {
  return apiRequest(`/api/admin/activities/${encodeURIComponent(id)}/pin`, {
    method: 'POST',
    token,
    body: { pinned },
  })
}

export function deleteAdminActivity(token, id) {
  return apiRequest(`/api/admin/activities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}

export function getAdminActivityApplications(token, options = {}) {
  return apiRequest(
    `/api/admin/activity-applications?${createGroupQuery(options)}`,
    { token, signal: options.signal },
  )
}

export function updateAdminActivityApplication(token, id, application) {
  return apiRequest(
    `/api/admin/activity-applications/${encodeURIComponent(id)}`,
    { method: 'PUT', token, body: application },
  )
}

export function reviewAdminActivityApplication(
  token,
  id,
  decision,
  options = {},
) {
  return apiRequest(
    `/api/admin/activity-applications/${encodeURIComponent(id)}/${decision}`,
    {
      method: 'POST',
      token,
      body: decision === 'approve' ? { pinned: Boolean(options.pinned) } : undefined,
    },
  )
}
