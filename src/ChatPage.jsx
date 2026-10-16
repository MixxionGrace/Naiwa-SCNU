import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  createChatMessage,
  createDocumentComment,
  deleteChatMessage,
  deleteDocumentComment,
  getChatRoom,
  getChatDocument,
  getCurrentSession,
  loginChat,
  logoutSession,
} from './api.js'
import OracleDocument from './OracleDocument.jsx'
import { ORACLE_DOCUMENT, ORACLE_DOCUMENT_SECTIONS } from '../server/src/oracle-document.js'
import './chat.css'
import './oracle-document.css'

const TOKEN_STORAGE_KEY = 'naiwa-scnu-oracle-room-token'
const POLL_INTERVAL_MS = 5000

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatDateTime(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? dateTimeFormatter.format(date) : '刚刚'
}

function roleLabel(role) {
  return role === 'superadmin' ? '系统管理员' : '协作成员'
}

function OracleLogin({ checking, message, onLogin, onExit }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(message)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => setError(message), [message])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await loginChat({ username, password })
      onLogin(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="oracle-login-page">
      <section className="oracle-login" aria-labelledby="oracle-login-title">
        <div className="oracle-login__brand" aria-hidden="true">
          <span>OR</span>
          <i />
        </div>
        <div className="oracle-login__copy">
          <span>PRIVATE COLLABORATION ROOM</span>
          <h1 id="oracle-login-title">Oracle Room</h1>
          <p>用于讨论游戏 AI 出牌逻辑与混合规划方案的内部协作页。</p>
        </div>
        <form className="oracle-login__form" onSubmit={handleSubmit}>
          <label>
            <span>账号</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={checking}
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
              disabled={checking}
              required
            />
          </label>
          {error && <p className="oracle-form-error" role="alert">{error}</p>}
          <button type="submit" disabled={submitting || checking}>
            {checking ? '正在恢复会话…' : submitting ? '正在验证…' : '进入协作室'}
          </button>
        </form>
        <button className="oracle-back-link" type="button" onClick={onExit}>
          返回小站
        </button>
      </section>
    </main>
  )
}

function DeleteDialog({ target, submitting, error, onCancel, onConfirm }) {
  if (!target) return null
  const noun = target.type === 'message' ? '消息' : '批注'
  return (
    <div
      className="oracle-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel()
      }}
    >
      <section
        className="oracle-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oracle-delete-title"
      >
        <span>DELETE {target.type.toUpperCase()}</span>
        <h2 id="oracle-delete-title">删除这条{noun}？</h2>
        <p>删除后无法恢复。</p>
        <blockquote>{target.item.content}</blockquote>
        {error && <p className="oracle-form-error" role="alert">{error}</p>}
        <div>
          <button type="button" onClick={onCancel} disabled={submitting}>取消</button>
          <button className="is-danger" type="button" onClick={onConfirm} disabled={submitting}>
            {submitting ? '正在删除…' : '确认删除'}
          </button>
        </div>
      </section>
    </div>
  )
}

function ChatWorkspace({ token, user, onLogout, onUnauthorized, onExit }) {
  const [messages, setMessages] = useState([])
  const [comments, setComments] = useState([])
  const [messageDraft, setMessageDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [documentHtml, setDocumentHtml] = useState('')
  const [documentLoading, setDocumentLoading] = useState(true)
  const [documentLoadAttempt, setDocumentLoadAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [sendingComment, setSendingComment] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [mobilePane, setMobilePane] = useState('chat')
  const messagesEndRef = useRef(null)
  const documentRef = useRef(null)
  const commentInputRef = useRef(null)

  const handleRequestError = useCallback((requestError) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onUnauthorized()
      return true
    }
    setError(requestError.message || '请求失败，请稍后再试。')
    return false
  }, [onUnauthorized])

  const loadRoom = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const result = await getChatRoom(token)
      setMessages(result.messages)
      setComments(result.comments)
      setError('')
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [handleRequestError, token])

  useEffect(() => {
    loadRoom()
    const poller = window.setInterval(() => loadRoom({ silent: true }), POLL_INTERVAL_MS)
    return () => window.clearInterval(poller)
  }, [loadRoom])

  useEffect(() => {
    const controller = new AbortController()
    setDocumentLoading(true)
    getChatDocument(token, { signal: controller.signal })
      .then((result) => {
        if (result.document.version !== ORACLE_DOCUMENT.version) {
          throw new Error('技术文档已更新，请刷新页面后查看。')
        }
        setDocumentHtml(result.document.html)
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') handleRequestError(requestError)
      })
      .finally(() => {
        if (!controller.signal.aborted) setDocumentLoading(false)
      })
    return () => controller.abort()
  }, [token, handleRequestError, documentLoadAttempt])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  useEffect(() => {
    if (commentsOpen) commentInputRef.current?.focus()
  }, [commentsOpen])

  const submitMessage = async (event) => {
    event.preventDefault()
    const content = messageDraft.trim()
    if (!content) return
    setSendingMessage(true)
    setError('')
    try {
      const result = await createChatMessage(token, content)
      setMessages((current) => [...current, result.item])
      setMessageDraft('')
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setSendingMessage(false)
    }
  }

  const updateSelectedQuote = useCallback(() => {
    const selection = window.getSelection()
    const root = documentRef.current
    if (!root || !selection?.rangeCount || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return
    const quote = selection.toString().trim().slice(0, 500)
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement
    const sectionId = startElement?.closest('[data-document-section]')?.dataset.documentSection
    if (!quote || !sectionId) return
    setSelectedQuote((current) => current?.quote === quote && current?.sectionId === sectionId
      ? current
      : { quote, sectionId })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', updateSelectedQuote)
    return () => document.removeEventListener('selectionchange', updateSelectedQuote)
  }, [updateSelectedQuote])

  const submitComment = async (event) => {
    event.preventDefault()
    const content = commentDraft.trim()
    if (!content || !selectedQuote) return
    setSendingComment(true)
    setError('')
    try {
      const result = await createDocumentComment(token, {
        content,
        ...selectedQuote,
        documentVersion: ORACLE_DOCUMENT.version,
      })
      setComments((current) => [result.item, ...current])
      setCommentDraft('')
      setSelectedQuote(null)
      setNotice('批注已添加到所选文字。')
      window.setTimeout(() => setNotice(''), 2200)
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setSendingComment(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      if (deleteTarget.type === 'message') {
        await deleteChatMessage(token, deleteTarget.item.id)
        setMessages((current) => current.filter((item) => item.id !== deleteTarget.item.id))
      } else {
        await deleteDocumentComment(token, deleteTarget.item.id)
        setComments((current) => current.filter((item) => item.id !== deleteTarget.item.id))
      }
      setDeleteTarget(null)
    } catch (requestError) {
      if (!handleRequestError(requestError)) setDeleteError(requestError.message)
    } finally {
      setDeleting(false)
    }
  }

  const navigateDocument = (sectionId) => {
    document.getElementById('oracle-doc-' + sectionId)?.scrollIntoView({ block: 'start' })
  }

  return (
    <main className="oracle-room">
      <header className="oracle-room__header">
        <div>
          <span className="oracle-room__monogram">OR</span>
          <div>
            <strong>Oracle Room</strong>
            <small>AI CARD-PLAY LAB · PRIVATE</small>
          </div>
        </div>
        <div className="oracle-room__session">
          <span><i />{user.username}</span>
          <small>{roleLabel(user.role)}</small>
          <button type="button" onClick={onExit}>返回小站</button>
          <button type="button" onClick={onLogout}>退出</button>
        </div>
      </header>

      <nav className="oracle-mobile-tabs" aria-label="协作页分栏">
        <button className={mobilePane === 'chat' ? 'is-active' : ''} type="button" onClick={() => setMobilePane('chat')}>讨论</button>
        <button className={mobilePane === 'plan' ? 'is-active' : ''} type="button" onClick={() => setMobilePane('plan')}>技术文档</button>
      </nav>

      {error && <div className="oracle-global-error" role="alert">{error}</div>}
      {notice && <div className="oracle-notice" role="status">{notice}</div>}

      <div className="oracle-room__workspace">
        <section className={`oracle-chat${mobilePane === 'chat' ? ' is-mobile-active' : ''}`} aria-labelledby="oracle-chat-title">
          <div className="oracle-pane-heading">
            <div>
              <span>LIVE DISCUSSION</span>
              <h1 id="oracle-chat-title">方案讨论</h1>
            </div>
            <small>{messages.length} 条消息</small>
          </div>

          <div className="oracle-chat__messages" aria-live="polite">
            {loading ? (
              <div className="oracle-empty">正在读取讨论…</div>
            ) : messages.length ? messages.map((message) => (
              <article
                className={`oracle-message${message.authorUsername === user.username ? ' is-mine' : ''}`}
                key={message.id}
              >
                <header>
                  <strong>{message.authorUsername}</strong>
                  {message.authorRole === 'superadmin' && <span>ADMIN</span>}
                  <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                </header>
                <p>{message.content}</p>
                {message.canDelete && (
                  <button type="button" onClick={() => setDeleteTarget({ type: 'message', item: message })}>删除</button>
                )}
              </article>
            )) : (
              <div className="oracle-empty">
                <strong>还没有消息</strong>
                <p>可以先说说你最想验证的 AI 行为。</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="oracle-chat__composer" onSubmit={submitMessage}>
            <textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder="输入讨论内容…"
              maxLength="1000"
              rows="3"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div>
              <small>{messageDraft.length} / 1000 · Enter 发送，Shift + Enter 换行</small>
              <button type="submit" disabled={!messageDraft.trim() || sendingMessage}>
                {sendingMessage ? '发送中…' : '发送'}
              </button>
            </div>
          </form>
        </section>

        <section className={`oracle-plan${mobilePane === 'plan' ? ' is-mobile-active' : ''}`} aria-labelledby="oracle-plan-title">
          <header className="oracle-plan__document-bar">
              <span aria-hidden="true">W</span>
              <div>
                <strong id="oracle-plan-title">{ORACLE_DOCUMENT.title}</strong>
                <small><i /> v0.2 · 只读文档 · 可评论</small>
              </div>
              <button
                className={'oracle-document__comments-toggle' + (commentsOpen ? ' is-active' : '')}
                type="button"
                onClick={() => setCommentsOpen((current) => !current)}
                aria-expanded={commentsOpen}
                aria-controls="oracle-comment-panel"
              >
                评论 <b>{comments.length}</b>
              </button>
          </header>

          {selectedQuote && !commentsOpen && (
            <div className="oracle-document__selection" role="status">
              <span>已选 {selectedQuote.quote.length} 字 · {ORACLE_DOCUMENT_SECTIONS.find((section) => section.id === selectedQuote.sectionId)?.label}</span>
              <button type="button" onClick={() => setCommentsOpen(true)}>评论所选文字</button>
              <button type="button" aria-label="取消所选文字" onClick={() => setSelectedQuote(null)}>×</button>
            </div>
          )}

          <div className="oracle-plan__scroll">
            <article className="oracle-plan__document">
              {documentLoading ? (
                <div className="oracle-empty">正在载入技术文档…</div>
              ) : documentHtml ? (
                <OracleDocument html={documentHtml} documentRef={documentRef} onSelectText={updateSelectedQuote} onNavigate={navigateDocument} />
              ) : (
                <div className="oracle-document__load-error">
                  <p>技术文档暂时无法载入。</p>
                  <button type="button" onClick={() => setDocumentLoadAttempt((current) => current + 1)}>重新载入</button>
                </div>
              )}
            </article>
          </div>

          {commentsOpen && (
            <aside className="oracle-document__annotation" id="oracle-comment-panel" aria-labelledby="oracle-annotation-title">
              <header>
                <div>
                  <span>DOCUMENT COMMENTS</span>
                  <h2 id="oracle-annotation-title">文档评论 <small>{comments.length}</small></h2>
                </div>
                <button type="button" aria-label="关闭文档评论" onClick={() => setCommentsOpen(false)}>×</button>
              </header>

              <form className="oracle-document__comment-form" onSubmit={submitComment}>
                {selectedQuote ? (
                  <blockquote>{selectedQuote.quote}</blockquote>
                ) : (
                  <p>在文档中选中文字，即可针对内容评论。</p>
                )}
                <textarea
                  ref={commentInputRef}
                  aria-label="文档评论内容"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="写下意见、疑问或建议…"
                  maxLength="2000"
                  rows="3"
                />
                <div>
                  <small>{commentDraft.length} / 2000</small>
                  <button
                    type="submit"
                    disabled={!selectedQuote || !commentDraft.trim() || sendingComment}
                  >
                    {sendingComment ? '提交中…' : '提交评论'}
                  </button>
                </div>
              </form>

              <div className="oracle-document__comments">
                {comments.length ? comments.map((comment) => (
                  <article className="oracle-document-comment" key={comment.id}>
                    {comment.sectionId && (
                      <button className="oracle-document-comment__location" type="button" onClick={() => {
                        setCommentsOpen(false)
                        navigateDocument(comment.sectionId)
                      }}>
                        {ORACLE_DOCUMENT_SECTIONS.find((section) => section.id === comment.sectionId)?.label || '文档'} · 定位原文 ↗
                      </button>
                    )}
                    {comment.quote && <blockquote>{comment.quote}</blockquote>}
                    <p>{comment.content}</p>
                    <footer>
                      <span>
                        <strong>{comment.authorUsername}</strong>
                        {comment.authorRole === 'superadmin' && <b>ADMIN</b>}
                        <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                      </span>
                      {comment.canDelete && (
                        <button type="button" onClick={() => setDeleteTarget({ type: 'comment', item: comment })}>删除</button>
                      )}
                    </footer>
                  </article>
                )) : (
                  <div className="oracle-document__no-comments">还没有评论，选中正文即可开始讨论。</div>
                )}
              </div>
            </aside>
          )}
        </section>
      </div>

      <DeleteDialog
        target={deleteTarget}
        submitting={deleting}
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteError('')
        }}
        onConfirm={confirmDelete}
      />
    </main>
  )
}

export default function ChatPage({ onExit }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) || '')
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(token))
  const [message, setMessage] = useState('')

  const clearSession = useCallback((nextMessage = '') => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken('')
    setUser(null)
    setChecking(false)
    setMessage(nextMessage)
  }, [])

  useEffect(() => {
    if (!token) return undefined
    const controller = new AbortController()
    setChecking(true)
    getCurrentSession(token, { signal: controller.signal })
      .then((result) => {
        setUser(result.user)
        setMessage('')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') clearSession('登录已过期，请重新登录。')
      })
      .finally(() => setChecking(false))
    return () => controller.abort()
  }, [clearSession, token])

  const handleLogin = (result) => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, result.token)
    setToken(result.token)
    setUser(result.user)
    setMessage('')
    setChecking(false)
  }

  const handleLogout = async () => {
    try {
      await logoutSession(token)
    } catch {
      // 服务端会话若已失效，浏览器令牌仍需清理。
    }
    clearSession('已安全退出协作室。')
  }

  if (!token || !user) {
    return (
      <OracleLogin
        checking={checking}
        message={message}
        onLogin={handleLogin}
        onExit={onExit}
      />
    )
  }

  return (
    <ChatWorkspace
      token={token}
      user={user}
      onLogout={handleLogout}
      onUnauthorized={() => clearSession('登录已过期，请重新登录。')}
      onExit={onExit}
    />
  )
}
