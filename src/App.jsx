import { useEffect, useRef, useState } from 'react'
import AdminPage from './AdminPage.jsx'
import {
  ApiError,
  checkGroupApplicationQq,
  createActivityApplication,
  createGroupApplication,
  getPageView,
  getPublicActivities,
  getPublicGroups,
  trackPageView,
} from './api.js'
import announcementPoster from './assets/scnu-sweet-girlfriend-poster.jpg'
import sponsorWechat from './assets/sponsor-wechat.jpg'
import sponsorAlipay from './assets/sponsor-alipay.jpg'
import naiwaLaughAudio from './assets/naiwa-laugh.m4a'
import { RELEASE_LOGS } from './releaseLogs.js'

const NAV_ITEMS = [
  { id: 'home', label: '首页' },
  { id: 'about', label: '关于我们' },
  { id: 'join', label: '加入华师音游吹水群' },
  { id: 'find', label: '查找华师同好群' },
  { id: 'events', label: '同好活动广场' },
]

const RESULT_PAGE = 'group-results'
const ADMIN_PAGE = 'admin'
const GROUPS_PER_PAGE = 20
const ACTIVITIES_PER_PAGE = 12
const RELEASE_LOGS_PER_PAGE = 10

const activityDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatActivityTime(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? activityDateFormatter.format(date) : value
}

function toActivityIsoTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  date.setSeconds(0, 0)
  return date.toISOString()
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
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

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  )
}

function MegaphoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 11 13-5v12L3 13v-2Z" />
      <path d="M16 9.5a3 3 0 0 1 0 5M7 14.5 8.5 20h3L10 15.7" />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" />
      <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M8 3v5M16 3v5M3.5 10h17M8 14h3M13 14h3M8 17h3" />
    </svg>
  )
}

function PictureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m5.5 18 4.7-4.8 3.1 3 2.4-2.4 2.8 2.8" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function ModalShell({ labelledBy, describedBy, className = '', onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={`modal-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          autoFocus
        >
          <CloseIcon />
        </button>
        {children}
      </section>
    </div>
  )
}

function AnnouncementModal({ onClose }) {
  return (
    <ModalShell
      labelledBy="announcement-modal-title"
      className="announcement-modal"
      onClose={onClose}
    >
      <h2 id="announcement-modal-title" className="visually-hidden">
        华南师范大学联动活动
      </h2>
      <img
        className="announcement-modal__image"
        src={announcementPoster}
        alt="甜蜜女友 2 与华南师范大学联动新生入学招集海报"
      />
      <div className="announcement-modal__actions">
        <button type="button" onClick={onClose}>下一步</button>
      </div>
    </ModalShell>
  )
}

function NewFeaturesModal({ onClose, onOpenReleaseLog }) {
  return (
    <ModalShell
      labelledBy="new-features-modal-title"
      describedBy="new-features-modal-copy"
      className="new-features-modal"
      onClose={onClose}
    >
      <div className="modal-heading">
        <span>WHAT&apos;S NEW</span>
        <h2 id="new-features-modal-title">新功能上线</h2>
        <p id="new-features-modal-copy">
          最近两项重要功能都整理在这里，找群和约活动现在都有着落啦。
        </p>
      </div>

      <div className="new-feature-list">
        <article className="new-feature-card">
          <span>NEW</span>
          <div>
            <h3>华师同好活动广场上线</h3>
            <p>
              可以浏览线上、线下同好活动，也能填写活动标题、内容、活动时间（支持待定）和群聊信息提交申请。
              通过站长审核后，活动才会在广场公开展示；申请人 QQ 号不会公开。
            </p>
          </div>
        </article>

        <article className="new-feature-card new-feature-card--previous">
          <span>01</span>
          <div>
            <h3>同好群自助申请上线</h3>
            <p>
              点击“想要宣群？”，填写群名、相关游戏、QQ 群号和申请人 QQ 号即可提交。
              系统会自动检查重复群号，申请通过审核后才会展示在同好群列表中。
            </p>
          </div>
        </article>
      </div>

      <div className="modal-actions new-features-modal__actions">
        <button type="button" onClick={onClose}>下一步</button>
        <button
          className="release-log-link"
          type="button"
          onClick={onOpenReleaseLog}
        >
          <HistoryIcon />
          最近更新
        </button>
      </div>
    </ModalShell>
  )
}

function ReleaseLogModal({ onClose }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(
    1,
    Math.ceil(RELEASE_LOGS.length / RELEASE_LOGS_PER_PAGE),
  )
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * RELEASE_LOGS_PER_PAGE
  const entries = RELEASE_LOGS.slice(start, start + RELEASE_LOGS_PER_PAGE)

  return (
    <ModalShell
      labelledBy="release-log-modal-title"
      describedBy="release-log-modal-copy"
      className="release-log-modal"
      onClose={onClose}
    >
      <div className="modal-heading">
        <span>RELEASE LOG</span>
        <h2 id="release-log-modal-title">最近更新</h2>
        <p id="release-log-modal-copy">
          华南奶蛙师范大学小站的功能与修复记录，最新内容排在最前面。
        </p>
      </div>

      <ol className="release-timeline" start={start + 1}>
        {entries.map((entry, index) => (
          <li key={`${entry.date}-${entry.title}`}>
            <div className="release-timeline__marker" aria-hidden="true">
              <span />
            </div>
            <article>
              <div className="release-timeline__meta">
                <time dateTime={entry.date}>{entry.date}</time>
                <span className={`release-type release-type--${entry.type.toLowerCase()}`}>
                  {entry.type}
                </span>
                <small>#{String(start + index + 1).padStart(2, '0')}</small>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
            </article>
          </li>
        ))}
      </ol>

      <div className="release-log-footer">
        <p>共 {RELEASE_LOGS.length} 条更新 · 每页 {RELEASE_LOGS_PER_PAGE} 条</p>
        <div className="release-pagination" aria-label="更新日志分页">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage === 1}
          >
            上一页
          </button>
          <span>{currentPage} / {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={currentPage === pageCount}
          >
            下一页
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function SponsorModal({ onClose }) {
  return (
    <ModalShell
      labelledBy="sponsor-modal-title"
      describedBy="sponsor-modal-copy"
      className="sponsor-modal"
      onClose={onClose}
    >
      <div className="modal-heading">
        <span>SUPPORT THIS SITE</span>
        <h2 id="sponsor-modal-title">赞助小站</h2>
        <p id="sponsor-modal-copy">
          请站长打一局 maimai 如何？或者帮助站长
          <a href="https://afdian.com/a/NoahDayo" target="_blank" rel="noreferrer">
            <strong>发发电</strong>
          </a>
          好不好嘛~
        </p>
      </div>

      <div className="sponsor-payment-grid">
        <figure className="payment-card payment-card--wechat">
          <img src={sponsorWechat} alt="微信赞助收款码" />
          <figcaption>微信支付</figcaption>
        </figure>
        <figure className="payment-card payment-card--alipay">
          <img src={sponsorAlipay} alt="支付宝赞助收款码" />
          <figcaption>支付宝</figcaption>
        </figure>
      </div>

      <div className="modal-actions">
        <button type="button" onClick={onClose}>谢谢支持</button>
      </div>
    </ModalShell>
  )
}

function validatePromoteFields({ name, keywords, qq, applicantQq }) {
  const errors = {}
  const keywordItems = keywords.split(/[,，、\n]+/).map((item) => item.trim()).filter(Boolean)

  if (!name.trim() || name.trim().length > 80) {
    errors.name = '群名需为 1–80 个字符。'
  }
  if (!keywordItems.length || keywordItems.length > 20) {
    errors.keywords = '请填写 1–20 个相关游戏或关键词。'
  } else if (keywordItems.some((keyword) => keyword.length > 40)) {
    errors.keywords = '每个游戏或关键词不能超过 40 个字符。'
  }
  if (!/^\d{5,12}$/.test(qq.replace(/\s+/g, ''))) {
    errors.qq = 'QQ 群号应为 5–12 位数字。'
  }
  if (!/^\d{5,12}$/.test(applicantQq.replace(/\s+/g, ''))) {
    errors.applicantQq = '申请人 QQ 号应为 5–12 位数字。'
  }

  return errors
}

function PromoteGroupModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    keywords: '',
    qq: '',
    applicantQq: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [availability, setAvailability] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    if (field === 'qq') setAvailability(null)
  }

  const checkQq = async ({ showDuplicate = false } = {}) => {
    const qq = form.qq.replace(/\s+/g, '')
    if (!/^\d{5,12}$/.test(qq)) return null

    setAvailability({ status: 'checking', message: '正在检查 QQ 群号…' })
    try {
      const response = await checkGroupApplicationQq(qq)
      setAvailability(response)
      if (showDuplicate && response.status !== 'available') setResult(response)
      return response
    } catch (requestError) {
      setAvailability(null)
      if (showDuplicate) setError(requestError.message)
      return null
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = validatePromoteFields(form)
    setFieldErrors(errors)
    setError('')
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      const duplicateCheck = await checkQq({ showDuplicate: true })
      if (!duplicateCheck || duplicateCheck.status !== 'available') return

      await createGroupApplication(form)
      setResult({
        status: 'submitted',
        message: '申请已提交。审核通过后，这个群会自动展示在同好群列表中。',
      })
    } catch (requestError) {
      if (requestError.code === 'ALREADY_PENDING') {
        setResult({ status: 'pending', message: requestError.message })
      } else if (requestError.code === 'ALREADY_APPROVED') {
        setResult({ status: 'approved', message: requestError.message })
      } else {
        setError(requestError.message)
        if (requestError instanceof ApiError) setFieldErrors(requestError.fields)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    const titles = {
      submitted: '申请已提交',
      pending: '已经在审核中',
      approved: '已经审核通过',
    }

    return (
      <ModalShell
        labelledBy="promote-result-title"
        describedBy="promote-result-copy"
        className="promote-modal promote-result-modal"
        onClose={onClose}
      >
        <div className={`promote-result promote-result--${result.status}`}>
          <span>{result.status === 'submitted' ? 'SUBMITTED' : 'QQ GROUP STATUS'}</span>
          <h2 id="promote-result-title">{titles[result.status]}</h2>
          <p id="promote-result-copy">{result.message}</p>
        </div>
        <div className="modal-actions promote-result__actions">
          {result.status === 'approved' ? (
            <button type="button" onClick={() => window.location.reload()}>
              刷新页面试试
            </button>
          ) : result.status === 'pending' ? (
            <button type="button" onClick={() => setResult(null)}>
              返回修改
            </button>
          ) : (
            <button type="button" onClick={onClose}>知道了</button>
          )}
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      labelledBy="promote-modal-title"
      describedBy="promote-modal-copy"
      className="promote-modal"
      onClose={onClose}
    >
      <div className="modal-heading">
        <span>SUBMIT YOUR GROUP</span>
        <h2 id="promote-modal-title">想要宣群？</h2>
        <p id="promote-modal-copy">
          填写申请并通过审核后，同好群会自动展示在页面中。
        </p>
      </div>

      <form className="promote-form" onSubmit={handleSubmit} noValidate>
        <div className="promote-form__grid">
          <label>
            <span>群名</span>
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="例如：华师音游吹水群"
              maxLength="80"
              required
            />
            {fieldErrors.name && <small>{fieldErrors.name}</small>}
          </label>

          <label>
            <span>QQ 群号</span>
            <input
              value={form.qq}
              onChange={(event) => updateField('qq', event.target.value)}
              onBlur={() => checkQq({ showDuplicate: true })}
              inputMode="numeric"
              placeholder="5–12 位数字"
              maxLength="12"
              required
            />
            {fieldErrors.qq && <small>{fieldErrors.qq}</small>}
            {!fieldErrors.qq && availability?.status === 'available' && (
              <em className="is-available">{availability.message}</em>
            )}
            {!fieldErrors.qq && availability?.status === 'checking' && (
              <em>{availability.message}</em>
            )}
          </label>

          <label className="promote-form__wide">
            <span>相关游戏</span>
            <textarea
              value={form.keywords}
              onChange={(event) => updateField('keywords', event.target.value)}
              placeholder="多个游戏用逗号分隔，例如：原神，明日方舟等"
              rows="3"
              required
            />
            <em>多个游戏或关键词请使用逗号、顿号或换行分隔。</em>
            {fieldErrors.keywords && <small>{fieldErrors.keywords}</small>}
          </label>

          <label className="promote-form__wide">
            <span>申请人 QQ 号</span>
            <input
              value={form.applicantQq}
              onChange={(event) => updateField('applicantQq', event.target.value)}
              inputMode="numeric"
              placeholder="用于站长联系你，不会公开"
              maxLength="12"
              required
            />
            {fieldErrors.applicantQq && <small>{fieldErrors.applicantQq}</small>}
          </label>
        </div>

        {error && <p className="promote-form__error" role="alert">{error}</p>}

        <button className="promote-form__submit" type="submit" disabled={submitting}>
          {submitting ? '正在提交…' : '提交审核'}
        </button>
      </form>

      <div className="promote-divider"><span>或者</span></div>

      <p className="promote-contact-copy">
        添加下方站长 QID 好友，由站长负责添加。
      </p>
      <div className="promote-contact">
        <span>站主 QQID</span>
        <strong>NoahDayo</strong>
      </div>

      <p className="promote-notice">
        注意：只有华师相关的同好群或社团群可在网站里宣传。
      </p>
    </ModalShell>
  )
}

function HostContactModal({ onClose }) {
  const [copied, setCopied] = useState(false)

  const copyQid = async () => {
    try {
      await navigator.clipboard.writeText('NoahDayo')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('复制站长 QQID：', 'NoahDayo')
    }
  }

  return (
    <ModalShell
      labelledBy="host-contact-title"
      describedBy="host-contact-copy"
      className="promote-modal host-contact-modal"
      onClose={onClose}
    >
      <div className="modal-heading">
        <span>CONTACT THE HOST</span>
        <h2 id="host-contact-title">联系站长</h2>
        <p id="host-contact-copy">
          添加站长 QID 好友，并说明对应活动以及需要展示的图片，由站长在管理端插入。
        </p>
      </div>

      <div className="promote-contact host-contact-card">
        <span>站长 QQID</span>
        <strong>NoahDayo</strong>
        <button type="button" onClick={copyQid}>
          <CopyIcon />
          {copied ? '已复制' : '复制 QID'}
        </button>
      </div>

      <div className="modal-actions">
        <button type="button" onClick={onClose}>返回活动投稿</button>
      </div>
    </ModalShell>
  )
}

function validateActivityFields(form) {
  const errors = {}
  const normalizedTimes = form.times.map(toActivityIsoTime).filter(Boolean)

  if (!form.title.trim() || form.title.trim().length > 100) {
    errors.title = '活动标题需为 1–100 个字符。'
  }
  if (!form.content.trim() || form.content.trim().length > 2000) {
    errors.content = '活动内容需为 1–2000 个字符。'
  }
  if (!form.groupName.trim() || form.groupName.trim().length > 80) {
    errors.groupName = '群名需为 1–80 个字符。'
  }
  if (!/^\d{5,12}$/.test(form.groupQq.replace(/\s+/g, ''))) {
    errors.groupQq = 'QQ 群号应为 5–12 位数字。'
  }
  if (!/^\d{5,12}$/.test(form.applicantQq.replace(/\s+/g, ''))) {
    errors.applicantQq = '申请人 QQ 号应为 5–12 位数字。'
  }
  if (
    !form.timeTbd &&
    (
      !form.times.length ||
      form.times.length > 20 ||
      normalizedTimes.length !== form.times.length ||
      new Set(normalizedTimes).size !== normalizedTimes.length
    )
  ) {
    errors.times = '请选择 1–20 个有效且不重复的活动时间。'
  }
  if (!form.modes.length) errors.modes = '请至少选择线上或线下其中一种。'

  return errors
}

function ActivitySubmissionModal({ onClose }) {
  const timeInputRefs = useRef([])
  const [form, setForm] = useState({
    title: '',
    content: '',
    groupName: '',
    groupQq: '',
    applicantQq: '',
    times: [''],
    timeTbd: false,
    modes: [],
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showContactHost, setShowContactHost] = useState(false)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
  }

  const updateTime = (index, value) => {
    updateField(
      'times',
      form.times.map((time, timeIndex) => (timeIndex === index ? value : time)),
    )
  }

  const removeTime = (index) => {
    if (form.times.length === 1) return
    updateField('times', form.times.filter((_, timeIndex) => timeIndex !== index))
  }

  const toggleTimeTbd = () => {
    setForm((current) => ({ ...current, timeTbd: !current.timeTbd }))
    setFieldErrors((current) => ({ ...current, times: '', timeTbd: '' }))
    setError('')
  }

  const openTimePicker = (index) => {
    const input = timeInputRefs.current[index]
    if (!input) return

    input.focus({ preventScroll: true })
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Some mobile browsers expose showPicker without allowing programmatic opening.
      }
    }
    input.click()
  }

  const toggleMode = (mode) => {
    updateField(
      'modes',
      form.modes.includes(mode)
        ? form.modes.filter((item) => item !== mode)
        : [...form.modes, mode],
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const errors = validateActivityFields(form)
    setFieldErrors(errors)
    setError('')
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      await createActivityApplication({
        ...form,
        times: form.timeTbd ? [] : form.times.map(toActivityIsoTime),
      })
      setSubmitted(true)
    } catch (requestError) {
      setError(requestError.message)
      if (requestError instanceof ApiError) setFieldErrors(requestError.fields)
    } finally {
      setSubmitting(false)
    }
  }

  if (showContactHost) {
    return <HostContactModal onClose={() => setShowContactHost(false)} />
  }

  if (submitted) {
    return (
      <ModalShell
        labelledBy="activity-submitted-title"
        describedBy="activity-submitted-copy"
        className="promote-modal activity-submit-modal activity-result-modal"
        onClose={onClose}
      >
        <div className="promote-result promote-result--submitted">
          <span>ACTIVITY SUBMITTED</span>
          <h2 id="activity-submitted-title">活动已提交</h2>
          <p id="activity-submitted-copy">
            站长审核通过后，活动会自动出现在华师同好活动广场中。
          </p>
        </div>
        <div className="modal-actions promote-result__actions">
          <button type="button" onClick={onClose}>知道了</button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      labelledBy="activity-submit-title"
      describedBy="activity-submit-copy"
      className="promote-modal activity-submit-modal"
      onClose={onClose}
    >
      <div className="modal-heading">
        <span>SUBMIT AN ACTIVITY</span>
        <h2 id="activity-submit-title">提交同好活动</h2>
        <p id="activity-submit-copy">
          填写活动与群聊信息。通过审核后，活动会公开展示在广场中。
        </p>
      </div>

      <form className="promote-form activity-submit-form" onSubmit={handleSubmit} noValidate>
        <div className="promote-form__grid">
          <label className="promote-form__wide">
            <span>活动标题</span>
            <input
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="例如：周五大学城舞萌拼机"
              maxLength="100"
              required
            />
            {fieldErrors.title && <small>{fieldErrors.title}</small>}
          </label>

          <label>
            <span>群名</span>
            <input
              value={form.groupName}
              onChange={(event) => updateField('groupName', event.target.value)}
              placeholder="活动所属同好群"
              maxLength="80"
              required
            />
            {fieldErrors.groupName && <small>{fieldErrors.groupName}</small>}
          </label>

          <label>
            <span>QQ 群号</span>
            <input
              value={form.groupQq}
              onChange={(event) => updateField('groupQq', event.target.value)}
              inputMode="numeric"
              placeholder="5–12 位数字"
              maxLength="12"
              required
            />
            {fieldErrors.groupQq && <small>{fieldErrors.groupQq}</small>}
          </label>

          <label className="promote-form__wide">
            <span>活动内容</span>
            <textarea
              value={form.content}
              onChange={(event) => updateField('content', event.target.value)}
              placeholder="介绍活动内容、集合地点、参与要求等"
              rows="5"
              maxLength="2000"
              required
            />
            <em>{form.content.length} / 2000</em>
            {fieldErrors.content && <small>{fieldErrors.content}</small>}
          </label>

          <fieldset className="promote-form__wide activity-mode-fieldset">
            <legend>活动形式（可多选）</legend>
            <div className="activity-mode-options">
              {[
                ['online', '线上'],
                ['offline', '线下'],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={form.modes.includes(value)}
                    onChange={() => toggleMode(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {fieldErrors.modes && <small>{fieldErrors.modes}</small>}
          </fieldset>

          <fieldset className="promote-form__wide activity-time-fieldset">
            <legend>活动时间（可多选或待定）</legend>
            <div className="activity-time-heading">
              <span>{form.timeTbd ? '当前时间：待定' : `已添加 ${form.times.length} 个时间`}</span>
              <div className="activity-time-actions">
                <button
                  className={`activity-time-tbd-toggle${form.timeTbd ? ' is-active' : ''}`}
                  type="button"
                  onClick={toggleTimeTbd}
                  aria-pressed={form.timeTbd}
                >
                  {form.timeTbd ? '✓ 时间待定' : '时间待定'}
                </button>
                <button
                  type="button"
                  onClick={() => updateField('times', [...form.times, ''])}
                  disabled={form.timeTbd || form.times.length >= 20}
                >
                  + 添加时间
                </button>
              </div>
            </div>
            {form.timeTbd ? (
              <div className="activity-time-tbd-state">
                具体时间暂未确定，审核通过后将在活动卡片和详情中显示“待定”。
              </div>
            ) : (
              <div className="activity-time-list">
                {form.times.map((time, index) => (
                  <div className="activity-time-row" key={`activity-time-${index}`}>
                    <div className="activity-time-picker">
                      <input
                        ref={(element) => { timeInputRefs.current[index] = element }}
                        type="datetime-local"
                        step="60"
                        value={time}
                        onChange={(event) => updateTime(index, event.target.value)}
                        aria-label={`活动时间 ${index + 1}`}
                        required
                      />
                      <button
                        className="activity-time-picker__trigger"
                        type="button"
                        onClick={() => openTimePicker(index)}
                        aria-label={`打开活动时间 ${index + 1} 的日期和时间选择器`}
                      >
                        <CalendarIcon />
                        <span>选择时间</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTime(index)}
                      disabled={form.times.length === 1}
                      aria-label={`删除活动时间 ${index + 1}`}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fieldErrors.times && <small>{fieldErrors.times}</small>}
          </fieldset>

          <label className="promote-form__wide">
            <span>申请人 QQ 号</span>
            <input
              value={form.applicantQq}
              onChange={(event) => updateField('applicantQq', event.target.value)}
              inputMode="numeric"
              placeholder="用于审核联系，不会公开"
              maxLength="12"
              required
            />
            {fieldErrors.applicantQq && <small>{fieldErrors.applicantQq}</small>}
          </label>
        </div>

        <button
          className="activity-image-contact"
          type="button"
          onClick={() => setShowContactHost(true)}
          aria-haspopup="dialog"
        >
          <PictureIcon />
          <span>
            <strong>如果需要展示图片，请联系站长插入</strong>
            <small>前台投稿暂不开放图片上传</small>
          </span>
          <ArrowIcon />
        </button>

        {error && <p className="promote-form__error" role="alert">{error}</p>}

        <button className="promote-form__submit" type="submit" disabled={submitting}>
          {submitting ? '正在提交…' : '提交活动审核'}
        </button>
      </form>
    </ModalShell>
  )
}

function HomePage() {
  const audioRef = useRef(null)
  const [isLaughing, setIsLaughing] = useState(false)
  const [audioMessage, setAudioMessage] = useState('')

  const playNaiwaLaugh = async () => {
    const audio = audioRef.current
    if (!audio) return

    setAudioMessage('')
    audio.currentTime = 0

    try {
      await audio.play()
    } catch {
      setIsLaughing(false)
      setAudioMessage('浏览器没有成功播放，请再点一次试试。')
    }
  }

  return (
    <section className="page page--home" aria-labelledby="home-title">
      <div className="hero__eyebrow">
        <span className="hero__eyebrow-dot" />
        SOUTH CHINA NORMAL UNIVERSITY
      </div>

      <h1 id="home-title">
        欢迎报考
        <span>华南师范大学</span>
      </h1>

      <p className="hero__copy">
        喜欢我华师奶蛙吗
      </p>

      <div className="hero__actions">
        <a
          className="primary-link"
          href="https://scnu.edu.cn"
          target="_blank"
          rel="noreferrer"
        >
          学校官网
          <ArrowIcon />
        </a>

        <button
          className={`audio-button${isLaughing ? ' is-playing' : ''}`}
          type="button"
          onClick={playNaiwaLaugh}
        >
          <SoundIcon />
          {isLaughing ? '奶蛙正在大笑…' : '点击收听奶蛙大笑'}
        </button>
      </div>

      <audio
        ref={audioRef}
        src={naiwaLaughAudio}
        preload="metadata"
        onPlaying={() => setIsLaughing(true)}
        onPause={() => setIsLaughing(false)}
        onEnded={() => setIsLaughing(false)}
        onError={() => {
          setIsLaughing(false)
          setAudioMessage('音频加载失败，请稍后再试。')
        }}
      />

      {audioMessage && (
        <p className="hero__note" aria-live="polite">
          {audioMessage}
        </p>
      )}
    </section>
  )
}

function AboutPage() {
  return (
    <section className="page page--inner" aria-labelledby="about-title">
      <h2 id="about-title">还没想好。</h2>
    </section>
  )
}

function JoinPage({ onCopy, copied }) {
  return (
    <section className="page page--inner page--join" aria-labelledby="join-title">
      <p className="section-kicker">RHYTHM GAME CLUB / 音游同好</p>
      <h2 id="join-title">想赤石的就来</h2>
      <p className="lead">
        想在华师找人一起打音游、聊谱面、赤石？在 QQ 中搜索下面的群号即可加入。
      </p>

      <div className="qq-card">
        <div>
          <span className="qq-card__label">华师音游吹水群 · QQ 群号</span>
          <strong>779 237 255</strong>
        </div>
        <button type="button" onClick={onCopy} aria-label="复制 QQ 群号 779237255">
          <CopyIcon />
          {copied ? '已复制' : '复制群号'}
        </button>
      </div>
    </section>
  )
}

function GroupSearchForm({ initialQuery = '', onSearch, compact = false }) {
  const [query, setQuery] = useState(initialQuery)
  const [error, setError] = useState('')

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextQuery = query.trim()

    if (!nextQuery) {
      setError('先输入一个群名或游戏名吧。')
      return
    }

    setError('')
    onSearch(nextQuery)
  }

  return (
    <form
      className={`group-search${compact ? ' group-search--compact' : ''}`}
      onSubmit={handleSubmit}
      role="search"
    >
      <label className="visually-hidden" htmlFor={compact ? 'result-query' : 'group-query'}>
        搜索群名或关键词
      </label>
      <div className="group-search__control">
        <SearchIcon />
        <input
          id={compact ? 'result-query' : 'group-query'}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            if (error) setError('')
          }}
          placeholder="输入群名或关键词，例如：音游 / maimai"
          autoComplete="off"
        />
        <button type="submit">
          查找
          <ArrowIcon />
        </button>
      </div>
      {error && <p className="group-search__error">{error}</p>}
    </form>
  )
}

function FindGroupsPage({ onSearch, onPromote }) {
  const [groupPage, setGroupPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [groups, setGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getPublicGroups({
      page: groupPage,
      pageSize: GROUPS_PER_PAGE,
      signal: controller.signal,
    })
      .then((result) => {
        setGroups(result.items)
        setTotal(result.total)
        setPageCount(result.pageCount)
        if (result.page !== groupPage) setGroupPage(result.page)
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [groupPage, refreshKey])

  const pageStart = (groupPage - 1) * GROUPS_PER_PAGE

  return (
    <section className="page page--inner page--find" aria-labelledby="find-title">
      <p className="section-kicker">FIND YOUR PEOPLE / 华师同好</p>
      <h2 id="find-title" className="find-title">
        查找华师
        <span>同好群</span>
      </h2>
      <p className="lead">
        输入你想找的群名或关键词。搜索会同时匹配群名与群内关键词，内容不完整也没关系。
      </p>

      <GroupSearchForm onSearch={onSearch} />

      <p className="search-tip">
        <button
          className="search-tip__promote"
          type="button"
          onClick={onPromote}
          aria-haspopup="dialog"
        >
          <MegaphoneIcon />
          想要宣群？
        </button>
        支持中文、英文、大小写和空格差异
      </p>

      <section className="group-directory" aria-labelledby="group-directory-title">
        <div className="group-directory__heading">
          <div>
            <span>GROUP DIRECTORY</span>
            <h3 id="group-directory-title">浏览华师同好群</h3>
          </div>
          <p>
            <strong>{total}</strong> 个群
          </p>
        </div>

        <div
          className="group-directory__rail"
          tabIndex="0"
          aria-label={`第 ${groupPage} 页同好群，可上下滑动`}
        >
          {loading && <p className="group-directory__state">正在读取最新群资料…</p>}
          {!loading && error && (
            <div className="group-directory__state group-directory__state--error">
              <span>{error}</span>
              <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
                重试
              </button>
            </div>
          )}
          {!loading && !error && groups.map((group, index) => (
            <button
              className="group-preview-card"
              key={group.id}
              type="button"
              onClick={() => onSearch(group.name)}
              aria-label={`查看${group.name}，QQ 群号 ${group.qq}`}
            >
              <span className="group-preview-card__index">
                {String(pageStart + index + 1).padStart(2, '0')}
              </span>
              <strong>{group.name}</strong>
              <span className="group-preview-card__games">
                {group.keywords.join(' · ')}
              </span>
              <span className="group-preview-card__qq">
                QQ {group.qq.replace(/(\d{3})(?=\d)/g, '$1 ')}
              </span>
            </button>
          ))}
        </div>

        <div className="group-directory__footer">
          <p>上下滑动查看更多 · 每页最多 {GROUPS_PER_PAGE} 个</p>
          {pageCount > 1 && (
            <div className="group-pagination" aria-label="同好群分页">
              <button
                type="button"
                onClick={() => setGroupPage((page) => Math.max(1, page - 1))}
                disabled={groupPage === 1 || loading}
              >
                上一页
              </button>
              <span>{groupPage} / {pageCount}</span>
              <button
                type="button"
                onClick={() =>
                  setGroupPage((page) => Math.min(pageCount, page + 1))
                }
                disabled={groupPage === pageCount || loading}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}

function ActivityDetailModal({ activity, onClose, onCopy, onPreviewImage, copied }) {
  const modeLabels = activity.modes.map((mode) =>
    mode === 'online' ? '线上' : '线下',
  )

  return (
    <ModalShell
      labelledBy="activity-detail-title"
      describedBy="activity-detail-content"
      className="activity-detail-modal"
      onClose={onClose}
    >
      <div className="activity-detail-modal__topline">
        <div>
          {activity.pinned && <span className="activity-detail-modal__pin">置顶</span>}
          {modeLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
        <span>SCNU ACTIVITY</span>
      </div>

      <div className="modal-heading activity-detail-modal__heading">
        <span>ACTIVITY DETAIL</span>
        <h2 id="activity-detail-title">{activity.title}</h2>
      </div>

      <section className="activity-detail-modal__content">
        <span>活动内容</span>
        <p id="activity-detail-content">{activity.content}</p>
      </section>

      <div className="activity-detail-modal__times">
        <strong>活动时间</strong>
        <ul>
          {activity.timeTbd ? (
            <li className="activity-time-is-tbd">待定</li>
          ) : (
            activity.times.map((time) => (
              <li key={time}>{formatActivityTime(time)}</li>
            ))
          )}
        </ul>
      </div>

      <div className="activity-detail-modal__group">
        <div>
          <span>发起同好群</span>
          <strong>{activity.groupName}</strong>
          <small>QQ 群号 {activity.groupQq}</small>
        </div>
        <button
          type="button"
          onClick={() => onCopy(activity.groupQq, `activity-${activity.id}`)}
          aria-label={`复制 QQ 群号 ${activity.groupQq}`}
        >
          <CopyIcon />
          {copied ? '已复制' : '复制群号'}
        </button>
      </div>

      {activity.imageUrl && (
        <section className="activity-detail-modal__image-section">
          <div className="activity-detail-modal__image-heading">
            <PictureIcon />
            <div>
              <strong>活动图片</strong>
              <span>点击图片放大查看</span>
            </div>
          </div>
          <button
            className="activity-detail-modal__image-link"
            type="button"
            onClick={() => onPreviewImage(activity)}
            aria-label={`放大查看${activity.title}活动图片`}
          >
            <img
              className="activity-detail-modal__image"
              src={activity.imageUrl}
              alt={`${activity.title}活动图片`}
            />
          </button>
        </section>
      )}
    </ModalShell>
  )
}

function ActivityImagePreviewModal({ activity, onClose }) {
  return (
    <ModalShell
      labelledBy="activity-image-preview-title"
      className="activity-image-preview-modal"
      onClose={onClose}
    >
      <h2 id="activity-image-preview-title" className="visually-hidden">
        {activity.title}活动图片
      </h2>
      <img src={activity.imageUrl} alt={`${activity.title}活动图片大图`} />
    </ModalShell>
  )
}

function ActivityCard({ activity, onOpen }) {
  const modeLabels = activity.modes.map((mode) =>
    mode === 'online' ? '线上' : '线下',
  )

  return (
    <article className={`activity-card${activity.pinned ? ' is-pinned' : ''}`}>
      <button
        className="activity-card__open"
        type="button"
        onClick={() => onOpen(activity)}
        aria-label={`查看活动详情：${activity.title}`}
      />

      <div className="activity-card__topline">
        <div>
          {activity.pinned && <span className="activity-card__pin">置顶</span>}
          {modeLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
        <span>SCNU ACTIVITY</span>
      </div>

      <h3>{activity.title}</h3>

      <div className="activity-card__times">
        <strong>活动时间</strong>
        <ul>
          {activity.timeTbd ? (
            <li className="activity-time-is-tbd">待定</li>
          ) : (
            activity.times.map((time) => (
              <li key={time}>{formatActivityTime(time)}</li>
            ))
          )}
        </ul>
      </div>

      <div className="activity-card__group">
        <div>
          <span>发起同好群</span>
          <strong>{activity.groupName}</strong>
          <small>QQ 群号 {activity.groupQq}</small>
        </div>
        <span className="activity-card__hint">
          查看详情
          <ArrowIcon />
        </span>
      </div>
    </article>
  )
}

function EventsPage({ onSubmitActivity, onOpenActivity }) {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [activityPage, setActivityPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [activities, setActivities] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getPublicActivities({
      query,
      page: activityPage,
      pageSize: ACTIVITIES_PER_PAGE,
      signal: controller.signal,
    })
      .then((result) => {
        setActivities(result.items)
        setTotal(result.total)
        setPageCount(result.pageCount)
        if (result.page !== activityPage) setActivityPage(result.page)
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [query, activityPage, refreshKey])

  const handleSearch = (event) => {
    event.preventDefault()
    setActivityPage(1)
    setQuery(searchInput.trim())
  }

  return (
    <section className="page page--events" aria-labelledby="events-title">
      <div className="events-hero">
        <div>
          <p className="section-kicker">SCNU ACTIVITY SQUARE / 华师同好</p>
          <h2 id="events-title">华师同好活动广场</h2>
          <p className="lead">
            看看最近有什么局，也可以把你的线上或线下活动提交给站长审核。
          </p>
        </div>
        <button type="button" onClick={onSubmitActivity} aria-haspopup="dialog">
          <MegaphoneIcon />
          提交活动
        </button>
      </div>

      <form className="activity-search" role="search" onSubmit={handleSearch}>
        <SearchIcon />
        <label className="visually-hidden" htmlFor="activity-query">
          搜索活动标题、内容或群名
        </label>
        <input
          id="activity-query"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="搜索活动标题、内容、群名或 QQ 群号"
        />
        <button type="submit">搜索活动</button>
      </form>

      <div className="events-summary" aria-live="polite">
        <p>{query ? `“${query}”找到 ${total} 个活动` : `广场共有 ${total} 个活动`}</p>
        {query && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('')
              setQuery('')
              setActivityPage(1)
            }}
          >
            清除搜索
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-results"><strong>正在打开广场</strong><p>正在读取最新活动…</p></div>
      ) : error ? (
        <div className="empty-results">
          <strong>暂时无法读取活动</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>重试</button>
        </div>
      ) : activities.length ? (
        <div className="activity-grid">
          {activities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              onOpen={onOpenActivity}
            />
          ))}
        </div>
      ) : (
        <div className="empty-results">
          <strong>{query ? '没有找到相关活动' : '广场还在等第一个活动'}</strong>
          <p>{query ? '换个短一点的关键词试试。' : '有想约的活动，就来提交第一份申请吧。'}</p>
          <button type="button" onClick={onSubmitActivity}>提交活动</button>
        </div>
      )}

      {pageCount > 1 && (
        <div className="group-pagination activity-pagination" aria-label="活动分页">
          <button
            type="button"
            onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
            disabled={activityPage === 1 || loading}
          >
            上一页
          </button>
          <span>{activityPage} / {pageCount}</span>
          <button
            type="button"
            onClick={() => setActivityPage((page) => Math.min(pageCount, page + 1))}
            disabled={activityPage === pageCount || loading}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  )
}

function GroupCard({ group, onCopy, copied }) {
  return (
    <article className="group-card">
      <div className="group-card__topline">
        <span>{group.matchLabel}</span>
        <span>SCNU GROUP</span>
      </div>

      <h3>{group.name}</h3>
      <p>收录关键词：{group.keywords.join('、')}</p>

      <div className="game-list" aria-label={`${group.name}包含的关键词`}>
        {group.keywords.map((keyword) => (
          <span key={keyword}>{keyword}</span>
        ))}
      </div>

      <div className="group-card__qq">
        <div>
          <span>QQ 群号</span>
          <strong>{group.qq.replace(/(\d{3})(?=\d)/g, '$1 ')}</strong>
        </div>
        <button
          type="button"
          onClick={() => onCopy(group.qq, group.id)}
          aria-label={`复制 QQ 群号 ${group.qq}`}
        >
          <CopyIcon />
          {copied ? '已复制' : '复制群号'}
        </button>
      </div>
    </article>
  )
}

function GroupResultsPage({ query, onSearch, onBack, onCopy, copiedGroupId }) {
  const [groups, setGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getPublicGroups({ query, page: 1, pageSize: 100, signal: controller.signal })
      .then((result) => {
        setGroups(result.items)
        setTotal(result.total)
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [query, refreshKey])

  return (
    <section className="page page--results" aria-labelledby="results-title">
      <button className="back-button" type="button" onClick={onBack}>
        <BackIcon />
        返回搜索
      </button>

      <div className="results-heading">
        <div>
          <p className="section-kicker">SEARCH RESULTS / 搜索结果</p>
          <h2 id="results-title">
            “{query}”
            <span>的同好群</span>
          </h2>
        </div>
        <p aria-live="polite">
          找到 <strong>{total}</strong> 个相关群
        </p>
      </div>

      <GroupSearchForm initialQuery={query} onSearch={onSearch} compact />

      {loading ? (
        <div className="empty-results"><strong>正在搜索</strong><p>正在从服务器读取最新群资料…</p></div>
      ) : error ? (
        <div className="empty-results">
          <strong>暂时无法查询</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>重试</button>
        </div>
      ) : groups.length > 0 ? (
        <div className="group-grid">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onCopy={onCopy}
              copied={copiedGroupId === group.id}
            />
          ))}
        </div>
      ) : (
        <div className="empty-results">
          <strong>暂时没找到</strong>
          <p>换一个更短的关键词试试，例如“音游”“舞萌”或“maimai”。</p>
          <button type="button" onClick={onBack}>重新搜索</button>
        </div>
      )}
    </section>
  )
}

function getInitialRoute() {
  const rawHash = window.location.hash.replace(/^#/, '')
  const [page = 'home', search = ''] = rawHash.split('?')
  const isKnownPage =
    NAV_ITEMS.some((item) => item.id === page) ||
    page === RESULT_PAGE ||
    page === ADMIN_PAGE

  return {
    page: isKnownPage ? page : 'home',
    query: new URLSearchParams(search).get('q') || '',
  }
}

function getNextStartupModal(current) {
  if (current === 'announcement') return 'new-features'
  if (current === 'new-features') return 'sponsor'
  return ''
}

export default function App() {
  const [route, setRoute] = useState(getInitialRoute)
  const [copiedGroupId, setCopiedGroupId] = useState('')
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [previewActivityImage, setPreviewActivityImage] = useState(null)
  const [pvCount, setPvCount] = useState(null)
  const pvTrackedRef = useRef(false)
  const [activeModal, setActiveModal] = useState(() =>
    getInitialRoute().page === ADMIN_PAGE ? '' : 'announcement',
  )
  const releaseLogReturnRef = useRef('')

  const openReleaseLog = (returnTo = '') => {
    releaseLogReturnRef.current = returnTo
    setActiveModal('release-log')
  }

  const closeReleaseLog = () => {
    const returnTo = releaseLogReturnRef.current
    releaseLogReturnRef.current = ''
    setActiveModal(returnTo)
  }

  useEffect(() => {
    const syncRoute = () => setRoute(getInitialRoute())
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [])

  useEffect(() => {
    document.title =
      route.page === ADMIN_PAGE
        ? '同好群与活动管理 · 华南奶蛙师范大学'
        : '华南奶蛙师范大学'
  }, [route.page])

  useEffect(() => {
    if (route.page === ADMIN_PAGE || pvTrackedRef.current) return

    pvTrackedRef.current = true
    trackPageView()
      .then((result) => {
        if (Number.isSafeInteger(result.pv)) setPvCount(result.pv)
      })
      .catch(() => {
        getPageView()
          .then((result) => {
            if (Number.isSafeInteger(result.pv)) setPvCount(result.pv)
          })
          .catch(() => undefined)
      })
  }, [route.page])

  useEffect(() => {
    if (!activeModal && !selectedActivity && !previewActivityImage) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (previewActivityImage) setPreviewActivityImage(null)
        else if (selectedActivity) setSelectedActivity(null)
        else if (activeModal === 'release-log') closeReleaseLog()
        else setActiveModal(getNextStartupModal)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeModal, selectedActivity, previewActivityImage])

  const updateRoute = (page, query = '') => {
    const nextHash =
      page === RESULT_PAGE
        ? `#${RESULT_PAGE}?q=${encodeURIComponent(query)}`
        : `#${page}`

    window.history.pushState(null, '', nextHash)
    setRoute({ page, query })
    setSelectedActivity(null)
    setPreviewActivityImage(null)
    if (page === ADMIN_PAGE) setActiveModal('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = async (qq, groupId) => {
    try {
      await navigator.clipboard.writeText(qq)
      setCopiedGroupId(groupId)
      window.setTimeout(() => setCopiedGroupId(''), 1800)
    } catch {
      window.prompt('复制这个 QQ 群号：', qq)
    }
  }

  const closeActiveModal = () => {
    setActiveModal(getNextStartupModal)
  }

  const activeNavPage = route.page === RESULT_PAGE ? 'find' : route.page
  const isResultsPage = route.page === RESULT_PAGE
  const isAdminPage = route.page === ADMIN_PAGE
  const isWidePage = isResultsPage || isAdminPage || route.page === 'events'

  return (
    <div className="app-shell">
      <div className="background" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <header className={`site-header${isAdminPage ? ' site-header--admin' : ''}`}>
        <button className="brand" type="button" onClick={() => updateRoute('home')}>
          <span className="brand__mark">华师</span>
          <span className="brand__text">
            <strong>SCNU</strong>
            <small>华南奶蛙师范大学</small>
          </span>
        </button>

        {!isAdminPage && (
          <nav aria-label="主导航">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={activeNavPage === item.id ? 'is-active' : ''}
                type="button"
                onClick={() => updateRoute(item.id)}
                aria-current={activeNavPage === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className="header-actions">
          {isAdminPage ? (
            <button className="header-action" type="button" onClick={() => updateRoute('home')}>
              返回前台
            </button>
          ) : (
            <>
              <button
                className="header-action header-action--sponsor"
                type="button"
                onClick={() => setActiveModal('sponsor')}
                aria-haspopup="dialog"
              >
                <HeartIcon />
                赞助小站
              </button>
              <button
                className="header-action"
                type="button"
                onClick={() => setActiveModal('promote')}
                aria-haspopup="dialog"
              >
                <MegaphoneIcon />
                想要宣群？
              </button>
              <button
                className="header-action header-action--release"
                type="button"
                onClick={() => openReleaseLog()}
                aria-haspopup="dialog"
              >
                <HistoryIcon />
                最近更新
              </button>
            </>
          )}
        </div>
      </header>

      <main
        className={`site-main${isResultsPage ? ' site-main--results' : ''}${isAdminPage ? ' site-main--admin' : ''}`}
      >
        <div
          className={`content-panel${isWidePage ? ' content-panel--wide' : ''}${isAdminPage ? ' content-panel--admin' : ''}`}
          key={`${route.page}-${route.query}`}
        >
          {route.page === 'home' && <HomePage />}
          {route.page === 'about' && <AboutPage />}
          {route.page === 'join' && (
            <JoinPage
              onCopy={() => handleCopy('779237255', 'join')}
              copied={copiedGroupId === 'join'}
            />
          )}
          {route.page === 'find' && (
            <FindGroupsPage
              onSearch={(query) => updateRoute(RESULT_PAGE, query)}
              onPromote={() => setActiveModal('promote')}
            />
          )}
          {route.page === RESULT_PAGE && (
            <GroupResultsPage
              query={route.query}
              onSearch={(query) => updateRoute(RESULT_PAGE, query)}
              onBack={() => updateRoute('find')}
              onCopy={handleCopy}
              copiedGroupId={copiedGroupId}
            />
          )}
          {route.page === 'events' && (
            <EventsPage
              onSubmitActivity={() => setActiveModal('activity-submit')}
              onOpenActivity={setSelectedActivity}
            />
          )}
          {route.page === ADMIN_PAGE && <AdminPage />}
        </div>

        <div className={`year-mark${isAdminPage ? ' year-mark--hidden' : ''}`} aria-hidden="true">
          <span>19</span>
          <span>33</span>
        </div>
      </main>

      {route.page === 'home' && Number.isSafeInteger(pvCount) && (
        <p className="pv-counter" aria-live="polite">
          自2026年10月15日起，你师奶蛙被访问了{' '}
          <strong>{pvCount.toLocaleString('zh-CN')}</strong> 次。
        </p>
      )}

      <footer className={isAdminPage ? 'site-footer--admin' : ''}>
        <p>华师音游同好</p>
        <p>非华南师范大学官方网站</p>
      </footer>

      {activeModal === 'announcement' && (
        <AnnouncementModal onClose={closeActiveModal} />
      )}
      {activeModal === 'new-features' && (
        <NewFeaturesModal
          onClose={closeActiveModal}
          onOpenReleaseLog={() => openReleaseLog('new-features')}
        />
      )}
      {activeModal === 'sponsor' && (
        <SponsorModal onClose={closeActiveModal} />
      )}
      {activeModal === 'promote' && (
        <PromoteGroupModal onClose={closeActiveModal} />
      )}
      {activeModal === 'activity-submit' && (
        <ActivitySubmissionModal onClose={closeActiveModal} />
      )}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onCopy={handleCopy}
          onPreviewImage={setPreviewActivityImage}
          copied={copiedGroupId === `activity-${selectedActivity.id}`}
        />
      )}
      {previewActivityImage && (
        <ActivityImagePreviewModal
          activity={previewActivityImage}
          onClose={() => setPreviewActivityImage(null)}
        />
      )}
      {activeModal === 'release-log' && (
        <ReleaseLogModal onClose={closeReleaseLog} />
      )}
    </div>
  )
}
