import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ApiError,
  createAdminActivity,
  createAdminGroup,
  deleteAdminActivity,
  deleteAdminActivityImage,
  deleteAdminGroup,
  getAdminActivities,
  getAdminActivityApplications,
  getAdminApplications,
  getAdminFeedbacks,
  getAdminGroups,
  loginAdmin,
  logoutAdmin,
  reviewAdminActivityApplication,
  reviewAdminApplication,
  setAdminActivityPinned,
  setAdminFeedbackStatus,
  uploadAdminActivityImage,
  updateAdminActivity,
  updateAdminActivityApplication,
  updateAdminApplication,
  updateAdminGroup,
} from './api.js'
import './admin.css'

const TOKEN_STORAGE_KEY = 'naiwa-scnu-admin-token'
const ADMIN_PAGE_SIZE = 10
const MAX_ACTIVITY_IMAGE_BYTES = 900 * 1024
const MAX_ACTIVITY_IMAGE_SOURCE_BYTES = 12 * 1024 * 1024
const MAX_ACTIVITY_IMAGE_DIMENSION = 1600
const ACTIVITY_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function decodeActivityImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  }

  const objectUrl = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('无法读取这张图片，请换一张试试。'))
    }
    image.src = objectUrl
  })
}

async function prepareActivityImage(file) {
  if (!ACTIVITY_IMAGE_TYPES.has(file.type)) {
    throw new Error('仅支持 JPG、PNG 或 WebP 图片。')
  }
  if (file.size > MAX_ACTIVITY_IMAGE_SOURCE_BYTES) {
    throw new Error('原图不能超过 12 MB。')
  }

  const decoded = await decodeActivityImage(file)
  try {
    const scale = Math.min(
      1,
      MAX_ACTIVITY_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法处理图片。')
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.86, 0.76, 0.66, 0.56]) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob && blob.size <= MAX_ACTIVITY_IMAGE_BYTES) return blob
    }
  } finally {
    decoded.close()
  }

  throw new Error('图片压缩后仍超过 900 KB，请选择尺寸更小的图片。')
}

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
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
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
    </div>,
    document.body,
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
        <p>登录后可维护同好群与活动资料、审核申请，并查看访客反馈。</p>
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

function ApplicationEditor({ token, application, onClose, onSaved, onUnauthorized }) {
  const [name, setName] = useState(application.name)
  const [keywords, setKeywords] = useState(application.keywords.join('，'))
  const [qq, setQq] = useState(application.qq)
  const [applicantQq, setApplicantQq] = useState(application.applicantQq)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)

    try {
      await updateAdminApplication(token, application.id, {
        name,
        keywords,
        qq,
        applicantQq,
      })
      onSaved('申请资料已更新。')
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
      titleId="application-editor-title"
      className="group-editor-dialog"
      onClose={onClose}
    >
      <div className="admin-dialog__heading">
        <span>EDIT APPLICATION</span>
        <h3 id="application-editor-title">编辑宣群申请</h3>
      </div>

      <form className="group-editor-form" onSubmit={handleSubmit}>
        <label>
          <span>群名</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
          {fieldErrors.name && <small>{fieldErrors.name}</small>}
        </label>

        <label>
          <span>相关游戏</span>
          <textarea
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            rows="4"
            required
          />
          <em>多个游戏或关键词请使用逗号、顿号或换行分隔。</em>
          {fieldErrors.keywords && <small>{fieldErrors.keywords}</small>}
        </label>

        <label>
          <span>QQ 群号</span>
          <input
            value={qq}
            onChange={(event) => setQq(event.target.value)}
            inputMode="numeric"
            required
          />
          {fieldErrors.qq && <small>{fieldErrors.qq}</small>}
        </label>

        <label>
          <span>申请人 QQ 号</span>
          <input
            value={applicantQq}
            onChange={(event) => setApplicantQq(event.target.value)}
            inputMode="numeric"
            required
          />
          {fieldErrors.applicantQq && <small>{fieldErrors.applicantQq}</small>}
        </label>

        {error && <p className="admin-form-error" role="alert">{error}</p>}

        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="admin-primary-button" disabled={submitting}>
            {submitting ? '正在保存…' : '保存修改'}
          </button>
        </div>
      </form>
    </AdminDialog>
  )
}

function ReviewConfirmation({
  token,
  application,
  decision,
  onClose,
  onReviewed,
  onUnauthorized,
}) {
  const isApprove = decision === 'approve'
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleReview = async () => {
    setSubmitting(true)
    setError('')
    try {
      await reviewAdminApplication(token, application.id, decision)
      onReviewed(
        isApprove
          ? '申请已通过，群资料已同步到前台。'
          : '申请已拒绝。',
      )
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
      titleId="review-application-title"
      className="delete-dialog review-dialog"
      onClose={onClose}
    >
      <div className={`delete-dialog__badge${isApprove ? ' is-approve' : ''}`}>
        {isApprove ? '✓' : '!'}
      </div>
      <div className="admin-dialog__heading">
        <span>{isApprove ? 'APPROVE APPLICATION' : 'REJECT APPLICATION'}</span>
        <h3 id="review-application-title">{isApprove ? '通过申请？' : '拒绝申请？'}</h3>
      </div>
      <p>
        {isApprove ? '通过后' : '拒绝后'}「<strong>{application.name}</strong>」
        {isApprove
          ? '会立即展示在前台同好群列表中，并保留审核记录。'
          : '会从待审核列表移入审核历史。'}
      </p>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog__actions">
        <button type="button" className="admin-secondary-button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className={isApprove ? 'admin-approve-button' : 'admin-danger-button'}
          onClick={handleReview}
          disabled={submitting}
        >
          {submitting ? '正在处理…' : isApprove ? '确认通过' : '确认拒绝'}
        </button>
      </div>
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

function toLocalDateTimeValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function toIsoDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setSeconds(0, 0)
  return date.toISOString()
}

function formatActivityTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function ActivityEditor({
  token,
  activity,
  application = false,
  onClose,
  onSaved,
  onUnauthorized,
}) {
  const isCreating = !application && activity === null
  const [title, setTitle] = useState(activity?.title || '')
  const [content, setContent] = useState(activity?.content || '')
  const [groupName, setGroupName] = useState(activity?.groupName || '')
  const [groupQq, setGroupQq] = useState(activity?.groupQq || '')
  const [applicantQq, setApplicantQq] = useState(activity?.applicantQq || '')
  const [times, setTimes] = useState(
    activity?.times?.length
      ? activity.times.map(toLocalDateTimeValue).filter(Boolean)
      : [''],
  )
  const [timeTbd, setTimeTbd] = useState(Boolean(activity?.timeTbd))
  const [modes, setModes] = useState(activity?.modes || [])
  const [pinned, setPinned] = useState(Boolean(activity?.pinned))
  const [imageUrl, setImageUrl] = useState(activity?.imageUrl || '')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState(activity?.imageUrl || '')
  const [imageProcessing, setImageProcessing] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => () => {
    if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  const toggleMode = (mode) => {
    setModes((current) =>
      current.includes(mode)
        ? current.filter((item) => item !== mode)
        : [...current, mode],
    )
    setFieldErrors((current) => ({ ...current, modes: '' }))
  }

  const updateTime = (index, value) => {
    setTimes((current) =>
      current.map((time, timeIndex) => (timeIndex === index ? value : time)),
    )
    setFieldErrors((current) => ({ ...current, times: '' }))
  }

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setImageProcessing(true)
    setFieldErrors((current) => ({ ...current, imageUrl: '' }))
    setError('')
    try {
      const prepared = await prepareActivityImage(file)
      setImageFile(prepared)
      setImagePreviewUrl(URL.createObjectURL(prepared))
    } catch (imageError) {
      setFieldErrors((current) => ({
        ...current,
        imageUrl: imageError.message,
      }))
    } finally {
      setImageProcessing(false)
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setImageUrl('')
    setImagePreviewUrl('')
    setFieldErrors((current) => ({ ...current, imageUrl: '' }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (imageProcessing) return
    setError('')
    setFieldErrors({})
    setSubmitting(true)

    let uploadedImageUrl = ''

    try {
      if (imageFile) {
        const uploaded = await uploadAdminActivityImage(token, imageFile)
        uploadedImageUrl = uploaded.item.url
      }

      const payload = {
        title,
        content,
        groupName,
        groupQq,
        times: timeTbd ? [] : times.map(toIsoDateTime),
        timeTbd,
        modes,
        imageUrl: uploadedImageUrl || imageUrl,
        ...(application ? { applicantQq } : { pinned }),
      }

      if (application) {
        await updateAdminActivityApplication(token, activity.id, payload)
      } else if (isCreating) {
        await createAdminActivity(token, payload)
      } else {
        await updateAdminActivity(token, activity.id, payload)
      }
      onSaved(
        application
          ? '活动申请已更新。'
          : isCreating
            ? '活动已创建并发布到前台。'
            : '活动资料已更新。',
      )
    } catch (requestError) {
      if (uploadedImageUrl) {
        deleteAdminActivityImage(token, uploadedImageUrl).catch(() => undefined)
      }
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
      titleId="activity-editor-title"
      className="group-editor-dialog activity-editor-dialog"
      onClose={onClose}
    >
      <div className="admin-dialog__heading">
        <span>
          {application
            ? 'EDIT ACTIVITY APPLICATION'
            : isCreating
              ? 'CREATE ACTIVITY'
              : 'EDIT ACTIVITY'}
        </span>
        <h3 id="activity-editor-title">
          {application
            ? '编辑活动申请'
            : isCreating
              ? '新增公开活动'
              : '编辑公开活动'}
        </h3>
      </div>

      <form className="group-editor-form activity-editor-form" onSubmit={handleSubmit}>
        <label>
          <span>活动标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          {fieldErrors.title && <small>{fieldErrors.title}</small>}
        </label>

        <div className="admin-form-grid">
          <label>
            <span>群名</span>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} required />
            {fieldErrors.groupName && <small>{fieldErrors.groupName}</small>}
          </label>
          <label>
            <span>QQ 群号</span>
            <input value={groupQq} onChange={(event) => setGroupQq(event.target.value)} inputMode="numeric" required />
            {fieldErrors.groupQq && <small>{fieldErrors.groupQq}</small>}
          </label>
        </div>

        <label>
          <span>活动内容</span>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows="5" required />
          {fieldErrors.content && <small>{fieldErrors.content}</small>}
        </label>

        <fieldset className="admin-activity-fieldset admin-activity-image-fieldset">
          <legend>活动图片（仅管理端可添加）</legend>
          {imagePreviewUrl ? (
            <img
              className="admin-activity-image-preview"
              src={imagePreviewUrl}
              alt={`${title || '活动'}图片预览`}
            />
          ) : (
            <div className="admin-activity-image-empty">
              <strong>暂无活动图片</strong>
              <span>添加后会展示在活动详情最下方</span>
            </div>
          )}
          <div className="admin-activity-image-actions">
            <label className={imageProcessing ? 'is-disabled' : ''}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                disabled={imageProcessing || submitting}
              />
              <span>
                {imageProcessing
                  ? '正在优化图片…'
                  : imagePreviewUrl
                    ? '更换图片'
                    : '选择图片'}
              </span>
            </label>
            {imagePreviewUrl && (
              <button
                type="button"
                onClick={removeImage}
                disabled={imageProcessing || submitting}
              >
                移除图片
              </button>
            )}
          </div>
          <p>支持 JPG、PNG、WebP；选择后会自动压缩，上传文件不超过 900 KB。</p>
          {fieldErrors.imageUrl && <small>{fieldErrors.imageUrl}</small>}
        </fieldset>

        <fieldset className="admin-activity-fieldset">
          <legend>活动形式（可多选）</legend>
          <div className="admin-check-options">
            {[
              ['online', '线上'],
              ['offline', '线下'],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={modes.includes(value)}
                  onChange={() => toggleMode(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {fieldErrors.modes && <small>{fieldErrors.modes}</small>}
        </fieldset>

        <fieldset className="admin-activity-fieldset">
          <legend>活动时间（可多选或待定）</legend>
          <div className="admin-activity-time-heading">
            <span>{timeTbd ? '当前时间：待定' : `已添加 ${times.length} 个时间`}</span>
            <div className="admin-activity-time-actions">
              <button
                className={timeTbd ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setTimeTbd((current) => !current)
                  setFieldErrors((current) => ({ ...current, times: '', timeTbd: '' }))
                }}
                aria-pressed={timeTbd}
              >
                {timeTbd ? '✓ 时间待定' : '时间待定'}
              </button>
              <button
                type="button"
                onClick={() => setTimes((current) => [...current, ''])}
                disabled={timeTbd || times.length >= 20}
              >
                + 添加时间
              </button>
            </div>
          </div>
          {timeTbd ? (
            <div className="admin-activity-time-tbd">
              具体时间暂未确定，前台会显示“待定”。
            </div>
          ) : (
            <div className="admin-activity-times">
              {times.map((time, index) => (
                <div key={`admin-time-${index}`}>
                  <input
                    type="datetime-local"
                    step="60"
                    value={time}
                    onChange={(event) => updateTime(index, event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    disabled={times.length === 1}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
          {fieldErrors.times && <small>{fieldErrors.times}</small>}
        </fieldset>

        {application ? (
          <label>
            <span>申请人 QQ 号</span>
            <input value={applicantQq} onChange={(event) => setApplicantQq(event.target.value)} inputMode="numeric" required />
            {fieldErrors.applicantQq && <small>{fieldErrors.applicantQq}</small>}
          </label>
        ) : (
          <label className="admin-pin-option">
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <span>将活动置顶</span>
          </label>
        )}

        {error && <p className="admin-form-error" role="alert">{error}</p>}

        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>取消</button>
          <button
            type="submit"
            className="admin-primary-button"
            disabled={submitting || imageProcessing}
          >
            {imageProcessing
              ? '正在处理图片…'
              : submitting
                ? isCreating ? '正在创建…' : '正在保存…'
                : isCreating ? '创建并发布' : '保存修改'}
          </button>
        </div>
      </form>
    </AdminDialog>
  )
}

function ActivityReviewConfirmation({
  token,
  application,
  decision,
  onClose,
  onReviewed,
  onUnauthorized,
}) {
  const isApprove = decision === 'approve'
  const [pinned, setPinned] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleReview = async () => {
    setSubmitting(true)
    setError('')
    try {
      await reviewAdminActivityApplication(token, application.id, decision, { pinned })
      onReviewed(
        isApprove ? '活动申请已通过并同步到前台。' : '活动申请已拒绝。',
      )
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
      titleId="review-activity-title"
      className="delete-dialog review-dialog"
      onClose={onClose}
    >
      <div className={`delete-dialog__badge${isApprove ? ' is-approve' : ''}`}>
        {isApprove ? '✓' : '!'}
      </div>
      <div className="admin-dialog__heading">
        <span>{isApprove ? 'APPROVE ACTIVITY' : 'REJECT ACTIVITY'}</span>
        <h3 id="review-activity-title">{isApprove ? '通过活动申请？' : '拒绝活动申请？'}</h3>
      </div>
      <p>
        {isApprove ? '通过后' : '拒绝后'}「<strong>{application.title}</strong>」
        {isApprove
          ? '会立即展示在活动广场中，并保留审核记录。'
          : '会从待审核列表移入审核历史。'}
      </p>
      {isApprove && (
        <label className="admin-pin-option admin-pin-option--review">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
          <span>审核通过时直接置顶</span>
        </label>
      )}
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog__actions">
        <button type="button" className="admin-secondary-button" onClick={onClose}>取消</button>
        <button
          type="button"
          className={isApprove ? 'admin-approve-button' : 'admin-danger-button'}
          onClick={handleReview}
          disabled={submitting}
        >
          {submitting ? '正在处理…' : isApprove ? '确认通过' : '确认拒绝'}
        </button>
      </div>
    </AdminDialog>
  )
}

function ActivityDeleteConfirmation({
  token,
  activity,
  onClose,
  onDeleted,
  onUnauthorized,
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleDelete = async () => {
    setSubmitting(true)
    setError('')
    try {
      await deleteAdminActivity(token, activity.id)
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
    <AdminDialog titleId="delete-activity-title" className="delete-dialog" onClose={onClose}>
      <div className="delete-dialog__badge">!</div>
      <div className="admin-dialog__heading">
        <span>DELETE ACTIVITY</span>
        <h3 id="delete-activity-title">确认删除活动？</h3>
      </div>
      <p>即将删除「<strong>{activity.title}</strong>」，删除后无法撤销。</p>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <div className="admin-dialog__actions">
        <button type="button" className="admin-secondary-button" onClick={onClose}>先不删除</button>
        <button type="button" className="admin-danger-button" onClick={handleDelete} disabled={submitting}>
          {submitting ? '正在删除…' : '确认删除'}
        </button>
      </div>
    </AdminDialog>
  )
}

function formatSubmittedAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function ReviewStatus({ application }) {
  const approved = application.status === 'approved'

  return (
    <div className="admin-review-status">
      <span className={approved ? 'is-approved' : 'is-rejected'}>
        {approved ? '已通过' : '已拒绝'}
      </span>
      <time dateTime={application.reviewedAt || undefined}>
        {formatSubmittedAt(application.reviewedAt)}
      </time>
    </div>
  )
}

const ADMIN_TABS = [
  { id: 'groups', label: '同好群列表' },
  { id: 'applications', label: '宣群审核' },
  { id: 'activities', label: '公开活动' },
  { id: 'activity-applications', label: '活动审核' },
  { id: 'feedbacks', label: '意见反馈' },
]

const FEEDBACK_CATEGORY_LABELS = {
  feature: '功能建议',
  issue: '问题反馈',
  other: '其他反馈',
}

function ActivityModeTags({ modes }) {
  return (
    <div className="admin-keywords">
      {modes.map((mode) => (
        <span key={mode}>{mode === 'online' ? '线上' : '线下'}</span>
      ))}
    </div>
  )
}

function ActivityTimesSummary({ times, timeTbd }) {
  if (timeTbd) {
    return <span className="admin-activity-time-tbd-badge">待定</span>
  }

  return (
    <div className="admin-activity-time-summary">
      {times.map((time) => (
        <time key={time} dateTime={time}>{formatActivityTime(time)}</time>
      ))}
    </div>
  )
}

function AdminDashboard({ token, onUnauthorized }) {
  const [activeTab, setActiveTab] = useState('groups')
  const [reviewView, setReviewView] = useState('pending')
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
  const [editorApplication, setEditorApplication] = useState(null)
  const [reviewingApplication, setReviewingApplication] = useState(null)
  const [editorActivity, setEditorActivity] = useState(undefined)
  const [deletingActivity, setDeletingActivity] = useState(null)
  const [editorActivityApplication, setEditorActivityApplication] = useState(null)
  const [reviewingActivityApplication, setReviewingActivityApplication] = useState(null)
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState('')
  const [notice, setNotice] = useState('')

  const isGroupApplicationsTab = activeTab === 'applications'
  const isActivitiesTab = activeTab === 'activities'
  const isActivityApplicationsTab = activeTab === 'activity-applications'
  const isFeedbacksTab = activeTab === 'feedbacks'
  const isGroupsTab = activeTab === 'groups'
  const isReviewTab = isGroupApplicationsTab || isActivityApplicationsTab
  const isSecondaryStatusView = (isReviewTab || isFeedbacksTab) && reviewView === 'history'
  const isHistoryView = isReviewTab && reviewView === 'history'
  const isProcessedFeedbackView = isFeedbacksTab && reviewView === 'history'

  useEffect(() => {
    const controller = new AbortController()
    const requests = {
      groups: getAdminGroups,
      applications: getAdminApplications,
      activities: getAdminActivities,
      'activity-applications': getAdminActivityApplications,
      feedbacks: getAdminFeedbacks,
    }
    setLoading(true)
    setError('')

    requests[activeTab](token, {
      query,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      status: isFeedbacksTab
        ? isProcessedFeedbackView ? 'processed' : 'pending'
        : isReviewTab
          ? isHistoryView ? 'reviewed' : 'pending'
          : '',
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
  }, [
    activeTab,
    token,
    query,
    page,
    refreshKey,
    onUnauthorized,
    isReviewTab,
    isHistoryView,
    isFeedbacksTab,
    isProcessedFeedbackView,
  ])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const refresh = (message) => {
    setEditorGroup(undefined)
    setDeletingGroup(null)
    setEditorApplication(null)
    setReviewingApplication(null)
    setEditorActivity(undefined)
    setDeletingActivity(null)
    setEditorActivityApplication(null)
    setReviewingActivityApplication(null)
    setUpdatingFeedbackId('')
    setNotice(message)
    setRefreshKey((value) => value + 1)
  }

  const selectTab = (nextTab) => {
    if (nextTab === activeTab) return
    setActiveTab(nextTab)
    setItems([])
    setTotal(0)
    setPage(1)
    setPageCount(1)
    setQueryInput('')
    setQuery('')
    setReviewView('pending')
    setError('')
  }

  const selectReviewView = (nextView) => {
    if (nextView === reviewView) return
    setReviewView(nextView)
    setItems([])
    setTotal(0)
    setPage(1)
    setPageCount(1)
    setError('')
  }

  const handleSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setQuery(queryInput.trim())
  }

  const handlePin = async (activity) => {
    try {
      await setAdminActivityPinned(token, activity.id, !activity.pinned)
      refresh(activity.pinned ? '活动已取消置顶。' : '活动已置顶。')
    } catch (requestError) {
      if (requestError.status === 401) {
        onUnauthorized()
        return
      }
      setNotice(requestError.message)
    }
  }

  const handleFeedbackStatus = async (feedback, status) => {
    setUpdatingFeedbackId(feedback.id)
    try {
      await setAdminFeedbackStatus(token, feedback.id, status)
      refresh(status === 'processed' ? '反馈已标记为已处理。' : '反馈已恢复为待处理。')
    } catch (requestError) {
      if (requestError.status === 401) {
        onUnauthorized()
        return
      }
      setNotice(requestError.message)
    } finally {
      setUpdatingFeedbackId('')
    }
  }

  const tabCopy = {
    groups: `当前共收录 ${total} 个群，所有修改会同步到前台查询。`,
    applications: isHistoryView
      ? `共找到 ${total} 条宣群审核历史。`
      : `当前有 ${total} 条待审核宣群申请。`,
    activities: `当前有 ${total} 个公开活动；置顶活动优先并按标题排序。`,
    'activity-applications': isHistoryView
      ? `共找到 ${total} 条活动审核历史。`
      : `当前有 ${total} 条待审核活动申请。通过后才会出现在前台。`,
    feedbacks: isProcessedFeedbackView
      ? `共找到 ${total} 条已处理反馈。`
      : `当前有 ${total} 条待处理意见反馈。`,
  }
  const searchPlaceholders = {
    groups: '搜索群名、关键词或 QQ 群号',
    applications: '搜索群名、游戏、群号或申请人 QQ',
    activities: '搜索活动标题、内容、群名或群号',
    'activity-applications': '搜索活动、群聊或申请人 QQ',
    feedbacks: '搜索反馈内容、类型或联系 QQ',
  }
  const columnCount = isGroupsTab ? 4 : isFeedbacksTab ? 5 : 6

  return (
    <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
      <div className="admin-dashboard__heading">
        <div>
          <span>GROUP, ACTIVITY &amp; FEEDBACK / CONTROL PANEL</span>
          <h2 id="admin-dashboard-title">同好群、活动与反馈管理</h2>
          <p>{tabCopy[activeTab]}</p>
        </div>
      </div>

      <div className="admin-tabs admin-tabs--five" role="tablist" aria-label="管理内容">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-active' : ''}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(isReviewTab || isFeedbacksTab) && (
        <div
          className="admin-review-filter"
          role="tablist"
          aria-label={
            isFeedbacksTab
              ? '反馈处理状态'
              : isGroupApplicationsTab
                ? '宣群申请状态'
                : '活动申请状态'
          }
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isSecondaryStatusView}
            className={!isSecondaryStatusView ? 'is-active' : ''}
            onClick={() => selectReviewView('pending')}
          >
            {isFeedbacksTab ? '待处理' : '待审核'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSecondaryStatusView}
            className={isSecondaryStatusView ? 'is-active' : ''}
            onClick={() => selectReviewView('history')}
          >
            {isFeedbacksTab ? '已处理' : '审核 / 申请历史'}
          </button>
        </div>
      )}

      {notice && <div className="admin-notice" role="status">{notice}</div>}

      <div className="admin-toolbar">
        <form className="admin-search" onSubmit={handleSearch} role="search">
          <SearchIcon />
          <label className="visually-hidden" htmlFor="admin-directory-query">
            {searchPlaceholders[activeTab]}
          </label>
          <input
            id="admin-directory-query"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder={searchPlaceholders[activeTab]}
          />
          <button type="submit">查询</button>
        </form>

        {isGroupsTab && (
          <button className="admin-create-button" type="button" onClick={() => setEditorGroup(null)}>
            <PlusIcon />
            新增同好群
          </button>
        )}
        {isActivitiesTab && (
          <button className="admin-create-button" type="button" onClick={() => setEditorActivity(null)}>
            <PlusIcon />
            新增活动
          </button>
        )}
      </div>

      <div className={`admin-table-card admin-table-card--${activeTab}`}>
        <div className="admin-table-scroll">
          <table>
            <thead>
              {isGroupsTab ? (
                <tr>
                  <th scope="col">群名</th>
                  <th scope="col">关键词</th>
                  <th scope="col">QQ 群号</th>
                  <th scope="col">操作</th>
                </tr>
              ) : isGroupApplicationsTab ? (
                <tr>
                  <th scope="col">群名</th>
                  <th scope="col">相关游戏</th>
                  <th scope="col">QQ 群号</th>
                  <th scope="col">申请人 QQ</th>
                  <th scope="col">提交时间</th>
                  <th scope="col">{isHistoryView ? '审核结果' : '操作'}</th>
                </tr>
              ) : isFeedbacksTab ? (
                <tr>
                  <th scope="col">类型</th>
                  <th scope="col">反馈内容</th>
                  <th scope="col">联系 QQ</th>
                  <th scope="col">提交时间</th>
                  <th scope="col">{isProcessedFeedbackView ? '处理记录' : '操作'}</th>
                </tr>
              ) : (
                <tr>
                  <th scope="col">{isActivitiesTab ? '置顶' : '标题'}</th>
                  <th scope="col">{isActivitiesTab ? '活动' : '群聊'}</th>
                  <th scope="col">{isActivitiesTab ? '群聊' : '活动时间'}</th>
                  <th scope="col">{isActivitiesTab ? '活动时间' : '形式'}</th>
                  <th scope="col">{isActivitiesTab ? '形式' : '申请人 QQ'}</th>
                  <th scope="col">{isHistoryView && isActivityApplicationsTab ? '审核结果' : '操作'}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr className="admin-table-state-row"><td colSpan={columnCount} className="admin-table-state">正在加载资料…</td></tr>
              ) : error ? (
                <tr className="admin-table-state-row">
                  <td colSpan={columnCount} className="admin-table-state admin-table-state--error">
                    {error}
                    <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>重试</button>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr className="admin-table-state-row"><td colSpan={columnCount} className="admin-table-state">当前没有匹配资料。</td></tr>
              ) : isGroupsTab ? (
                items.map((group) => (
                  <tr key={group.id}>
                    <td data-label="群名"><strong>{group.name}</strong></td>
                    <td data-label="关键词"><div className="admin-keywords">{group.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></td>
                    <td data-label="QQ 群号"><code>{group.qq}</code></td>
                    <td data-label="操作">
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => setEditorGroup(group)}>编辑</button>
                        <button className="is-danger" type="button" onClick={() => setDeletingGroup(group)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : isGroupApplicationsTab ? (
                items.map((application) => (
                  <tr key={application.id}>
                    <td data-label="群名"><strong>{application.name}</strong></td>
                    <td data-label="相关游戏"><div className="admin-keywords">{application.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></td>
                    <td data-label="QQ 群号"><code>{application.qq}</code></td>
                    <td data-label="申请人 QQ"><code className="admin-applicant-qq">{application.applicantQq}</code></td>
                    <td data-label="提交时间"><time dateTime={application.createdAt}>{formatSubmittedAt(application.createdAt)}</time></td>
                    <td data-label={isHistoryView ? '审核结果' : '操作'}>
                      {isHistoryView ? (
                        <ReviewStatus application={application} />
                      ) : (
                        <div className="admin-row-actions admin-row-actions--review">
                          <button type="button" onClick={() => setEditorApplication(application)}>编辑</button>
                          <button className="is-approve" type="button" onClick={() => setReviewingApplication({ application, decision: 'approve' })}>通过</button>
                          <button className="is-danger" type="button" onClick={() => setReviewingApplication({ application, decision: 'reject' })}>拒绝</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : isFeedbacksTab ? (
                items.map((feedback) => (
                  <tr key={feedback.id}>
                    <td data-label="类型">
                      <span className={`admin-feedback-category admin-feedback-category--${feedback.category}`}>
                        {FEEDBACK_CATEGORY_LABELS[feedback.category] || '其他反馈'}
                      </span>
                    </td>
                    <td data-label="反馈内容">
                      <p className="admin-feedback-content">{feedback.content}</p>
                    </td>
                    <td data-label="联系 QQ">
                      {feedback.contactQq ? (
                        <code className="admin-applicant-qq">{feedback.contactQq}</code>
                      ) : (
                        <span className="admin-feedback-empty">未填写</span>
                      )}
                    </td>
                    <td data-label="提交时间">
                      <time dateTime={feedback.createdAt}>{formatSubmittedAt(feedback.createdAt)}</time>
                    </td>
                    <td data-label={isProcessedFeedbackView ? '处理记录' : '操作'}>
                      {isProcessedFeedbackView && (
                        <time className="admin-feedback-processed-at" dateTime={feedback.processedAt || undefined}>
                          {formatSubmittedAt(feedback.processedAt)} 已处理
                        </time>
                      )}
                      <div className="admin-row-actions admin-row-actions--feedback">
                        <button
                          type="button"
                          className={isProcessedFeedbackView ? 'is-unpin' : 'is-approve'}
                          onClick={() => handleFeedbackStatus(
                            feedback,
                            isProcessedFeedbackView ? 'pending' : 'processed',
                          )}
                          disabled={updatingFeedbackId === feedback.id}
                        >
                          {updatingFeedbackId === feedback.id
                            ? '处理中…'
                            : isProcessedFeedbackView
                              ? '恢复待处理'
                              : '标记已处理'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : isActivitiesTab ? (
                items.map((activity) => (
                  <tr key={activity.id}>
                    <td data-label="置顶"><span className={`admin-pin-badge${activity.pinned ? ' is-pinned' : ''}`}>{activity.pinned ? '已置顶' : '普通'}</span></td>
                    <td data-label="活动">
                      <div className="admin-activity-title-row">
                        <strong>{activity.title}</strong>
                        {activity.imageUrl && <span>有图</span>}
                      </div>
                      <small className="admin-activity-excerpt">{activity.content}</small>
                    </td>
                    <td data-label="群聊"><strong>{activity.groupName}</strong><code>{activity.groupQq}</code></td>
                    <td data-label="活动时间"><ActivityTimesSummary times={activity.times} timeTbd={activity.timeTbd} /></td>
                    <td data-label="形式"><ActivityModeTags modes={activity.modes} /></td>
                    <td data-label="操作">
                      <div className="admin-row-actions admin-row-actions--activity">
                        <button type="button" className={activity.pinned ? 'is-unpin' : 'is-pin'} onClick={() => handlePin(activity)}>{activity.pinned ? '取消置顶' : '置顶'}</button>
                        <button type="button" onClick={() => setEditorActivity(activity)}>编辑</button>
                        <button className="is-danger" type="button" onClick={() => setDeletingActivity(activity)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                items.map((application) => (
                  <tr key={application.id}>
                    <td data-label="标题">
                      <div className="admin-activity-title-row">
                        <strong>{application.title}</strong>
                        {application.imageUrl && <span>有图</span>}
                      </div>
                      <small className="admin-activity-excerpt">{application.content}</small>
                    </td>
                    <td data-label="群聊"><strong>{application.groupName}</strong><code>{application.groupQq}</code></td>
                    <td data-label="活动时间"><ActivityTimesSummary times={application.times} timeTbd={application.timeTbd} /></td>
                    <td data-label="形式"><ActivityModeTags modes={application.modes} /></td>
                    <td data-label="申请人 QQ"><code className="admin-applicant-qq">{application.applicantQq}</code></td>
                    <td data-label={isHistoryView ? '审核结果' : '操作'}>
                      {isHistoryView ? (
                        <ReviewStatus application={application} />
                      ) : (
                        <div className="admin-row-actions admin-row-actions--review">
                          <button type="button" onClick={() => setEditorActivityApplication(application)}>编辑</button>
                          <button className="is-approve" type="button" onClick={() => setReviewingActivityApplication({ application, decision: 'approve' })}>通过</button>
                          <button className="is-danger" type="button" onClick={() => setReviewingActivityApplication({ application, decision: 'reject' })}>拒绝</button>
                        </div>
                      )}
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
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>上一页</button>
            <span>第 {page} / {pageCount} 页</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount || loading}>下一页</button>
          </div>
        </div>
      </div>

      {editorGroup !== undefined && (
        <GroupEditor token={token} group={editorGroup} onClose={() => setEditorGroup(undefined)} onSaved={refresh} onUnauthorized={onUnauthorized} />
      )}
      {deletingGroup && (
        <DeleteConfirmation token={token} group={deletingGroup} onClose={() => setDeletingGroup(null)} onDeleted={() => refresh('群资料已删除。')} onUnauthorized={onUnauthorized} />
      )}
      {editorApplication && (
        <ApplicationEditor token={token} application={editorApplication} onClose={() => setEditorApplication(null)} onSaved={refresh} onUnauthorized={onUnauthorized} />
      )}
      {reviewingApplication && (
        <ReviewConfirmation token={token} application={reviewingApplication.application} decision={reviewingApplication.decision} onClose={() => setReviewingApplication(null)} onReviewed={refresh} onUnauthorized={onUnauthorized} />
      )}
      {editorActivity !== undefined && (
        <ActivityEditor token={token} activity={editorActivity} onClose={() => setEditorActivity(undefined)} onSaved={refresh} onUnauthorized={onUnauthorized} />
      )}
      {deletingActivity && (
        <ActivityDeleteConfirmation token={token} activity={deletingActivity} onClose={() => setDeletingActivity(null)} onDeleted={() => refresh('活动已删除。')} onUnauthorized={onUnauthorized} />
      )}
      {editorActivityApplication && (
        <ActivityEditor token={token} activity={editorActivityApplication} application onClose={() => setEditorActivityApplication(null)} onSaved={refresh} onUnauthorized={onUnauthorized} />
      )}
      {reviewingActivityApplication && (
        <ActivityReviewConfirmation token={token} application={reviewingActivityApplication.application} decision={reviewingActivityApplication.decision} onClose={() => setReviewingActivityApplication(null)} onReviewed={refresh} onUnauthorized={onUnauthorized} />
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
