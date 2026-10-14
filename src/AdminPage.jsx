import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createAdminGroup,
  deleteAdminGroup,
  getAdminGroups,
  loginAdmin,
  logoutAdmin,
  updateAdminGroup,
} from './api.js'
import './admin.css'

const TOKEN_STORAGE_KEY = 'naiwa-scnu-admin-token'
const ADMIN_PAGE_SIZE = 10

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function AdminDialog({ titleId, className = '', onClose, children }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="admin-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={`admin-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          className="admin-dialog__close"
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
        >
          <CloseIcon />
        </button>
        {children}
      </section>
    </div>
  )
}

function AdminLogin({ message, onAuthenticated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(message)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = await loginAdmin({ username, password })
      onAuthenticated(result.token)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="admin-login" aria-labelledby="admin-login-title">
      <div className="admin-login__intro">
        <span>SCNU GROUP CONTROL</span>
        <h2 id="admin-login-title">管理端登录</h2>
        <p>登录后可维护同好群名称、关键词和 QQ 群号。</p>
      </div>

      <form className="admin-login__form" onSubmit={handleSubmit}>
        <label>
          <span>账号</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="admin-form-error" role="alert">{error}</p>}
        <button className="admin-primary-button" type="submit" disabled={submitting}>
          {submitting ? '正在验证…' : '登录管理端'}
        </button>
      </form>
    </section>
  )
}

function GroupEditor({ token, group, onClose, onSaved, onUnauthorized }) {
  const isEditing = Boolean(group)
  const [name, setName] = useState(group?.name || '')
  const [keywords, setKeywords] = useState(group?.keywords.join('，') || '')
  const [qq, setQq] = useState(group?.qq || '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)

    const payload = { name, keywords, qq }

    try {
      if (isEditing) await updateAdminGroup(token, group.id, payload)
      else await createAdminGroup(token, payload)
      onSaved(isEditing ? '群资料已更新。' : '新群已添加。')
    } catch (requestError) {
      if (requestError.status === 401) {
        onUnauthorized()
        return
      }
      setError(requestError.message)
      if (requestError instanceof ApiError) setFieldErrors(requestError.fields)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminDialog
      titleId="group-editor-title"
      className="group-editor-dialog"
      onClose={onClose}
    >
      <div className="admin-dialog__heading">
        <span>{isEditing ? 'EDIT GROUP' : 'CREATE GROUP'}</span>
        <h3 id="group-editor-title">{isEditing ? '编辑同好群' : '新增同好群'}</h3>
      </div>

      <form className="group-editor-form" onSubmit={handleSubmit}>
        <label>
          <span>群名</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：华师音游吹水群"
            autoFocus
            required
          />
          {fieldErrors.name && <small>{fieldErrors.name}</small>}
        </label>

        <label>
          <span>关键词</span>
          <textarea
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="多个关键词用逗号分隔，例如：舞萌，CHUNITHM，Arcaea"
            rows="4"
            required
          />
          <em>多个关键词请使用逗号、顿号或换行分隔。</em>
          {fieldErrors.keywords && <small>{fieldErrors.keywords}</small>}
        </label>

        <label>
          <span>QQ 群号</span>
          <input
            value={qq}
            onChange={(event) => setQq(event.target.value)}
            inputMode="numeric"
            placeholder="5–12 位数字"
            required
          />
          {fieldErrors.qq && <small>{fieldErrors.qq}</small>}
        </label>

        {error && <p className="admin-form-error" role="alert">{error}</p>}

        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="admin-primary-button" disabled={submitting}>
            {submitting ? '正在保存…' : isEditing ? '保存修改' : '确认新增'}
          </button>
        </div>
      </form>
    </AdminDialog>
  )
}

function DeleteConfirmation({ token, group, onClose, onDeleted, onUnauthorized }) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleDelete = async () => {
    setSubmitting(true)
    setError('')
    try {
      await deleteAdminGroup(token, group.id)
      onDeleted()
    } catch (requestError) {
      if (requestError.status === 401) {
        onUnauthorized()
        return
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminDialog
      titleId="delete-group-title"
      className="delete-dialog"
      onClose={onClose}
    >
      <div className="delete-dialog__badge">!</div>
      <div className="admin-dialog__heading">
        <span>DELETE GROUP</span>
        <h3 id="delete-group-title">确认删除？</h3>
      </div>
      <p>
        即将删除「<strong>{group.name}</strong>」。删除后前台将不再展示该群，且无法撤销。
      </p>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog__actions">
        <button type="button" className="admin-secondary-button" onClick={onClose}>
          先不删除
        </button>
        <button
          type="button"
          className="admin-danger-button"
          onClick={handleDelete}
          disabled={submitting}
        >
          {submitting ? '正在删除…' : '确认删除'}
        </button>
      </div>
    </AdminDialog>
  )
}

function AdminDashboard({ token, onUnauthorized }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [editorGroup, setEditorGroup] = useState(undefined)
  const [deletingGroup, setDeletingGroup] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getAdminGroups(token, {
      query,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      signal: controller.signal,
    })
      .then((result) => {
        setItems(result.items)
        setTotal(result.total)
        setPage(result.page)
        setPageCount(result.pageCount)
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return
        if (requestError.status === 401) {
          onUnauthorized()
          return
        }
        setError(requestError.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [token, query, page, refreshKey, onUnauthorized])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const refresh = (message) => {
    setEditorGroup(undefined)
    setDeletingGroup(null)
    setNotice(message)
    setRefreshKey((value) => value + 1)
  }

  const handleSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setQuery(queryInput.trim())
  }

  return (
    <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
      <div className="admin-dashboard__heading">
        <div>
          <span>GROUP DIRECTORY / CONTROL PANEL</span>
          <h2 id="admin-dashboard-title">同好群管理</h2>
          <p>当前共收录 {total} 个群，所有修改会同步到前台查询。</p>
        </div>
      </div>

      {notice && <div className="admin-notice" role="status">{notice}</div>}

      <div className="admin-toolbar">
        <form className="admin-search" onSubmit={handleSearch} role="search">
          <SearchIcon />
          <label className="visually-hidden" htmlFor="admin-group-query">
            搜索群名、关键词或 QQ 群号
          </label>
          <input
            id="admin-group-query"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="搜索群名、关键词或 QQ 群号"
          />
          <button type="submit">查询</button>
        </form>

        <button
          className="admin-create-button"
          type="button"
          onClick={() => setEditorGroup(null)}
        >
          <PlusIcon />
          新增同好群
        </button>
      </div>

      <div className="admin-table-card">
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">群名</th>
                <th scope="col">关键词</th>
                <th scope="col">QQ 群号</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="admin-table-state">正在加载群资料…</td></tr>
              ) : error ? (
                <tr>
                  <td colSpan="4" className="admin-table-state admin-table-state--error">
                    {error}
                    <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
                      重试
                    </button>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="4" className="admin-table-state">没有找到匹配的同好群。</td></tr>
              ) : (
                items.map((group) => (
                  <tr key={group.id}>
                    <td><strong>{group.name}</strong></td>
                    <td>
                      <div className="admin-keywords">
                        {group.keywords.map((keyword) => (
                          <span key={keyword}>{keyword}</span>
                        ))}
                      </div>
                    </td>
                    <td><code>{group.qq}</code></td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => setEditorGroup(group)}>编辑</button>
                        <button
                          className="is-danger"
                          type="button"
                          onClick={() => setDeletingGroup(group)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-table-footer">
          <p>每页 {ADMIN_PAGE_SIZE} 条</p>
          <div className="admin-pagination" aria-label="管理端分页">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
            >
              上一页
            </button>
            <span>第 {page} / {pageCount} 页</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              disabled={page >= pageCount || loading}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {editorGroup !== undefined && (
        <GroupEditor
          token={token}
          group={editorGroup}
          onClose={() => setEditorGroup(undefined)}
          onSaved={refresh}
          onUnauthorized={onUnauthorized}
        />
      )}

      {deletingGroup && (
        <DeleteConfirmation
          token={token}
          group={deletingGroup}
          onClose={() => setDeletingGroup(null)}
          onDeleted={() => refresh('群资料已删除。')}
          onUnauthorized={onUnauthorized}
        />
      )}
    </section>
  )
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) || '')
  const [message, setMessage] = useState('')

  const clearSession = useCallback((nextMessage = '') => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken('')
    setMessage(nextMessage)
  }, [])

  const handleAuthenticated = (nextToken) => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
    setToken(nextToken)
    setMessage('')
  }

  const handleUnauthorized = useCallback(
    () => clearSession('登录已过期，请重新登录。'),
    [clearSession],
  )

  const handleLogout = async () => {
    try {
      await logoutAdmin(token)
    } catch {
      // 即使服务端会话已经失效，也要清理浏览器中的令牌。
    }
    clearSession('已安全退出管理端。')
  }

  if (!token) {
    return <AdminLogin message={message} onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="admin-authenticated">
      <button className="admin-logout-button" type="button" onClick={handleLogout}>
        退出登录
      </button>
      <AdminDashboard
        token={token}
        onUnauthorized={handleUnauthorized}
      />
    </div>
  )
}
