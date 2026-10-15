import { useEffect, useRef, useState } from 'react'
import AdminPage from './AdminPage.jsx'
import {
  ApiError,
  checkGroupApplicationQq,
  createGroupApplication,
  getPageView,
  getPublicGroups,
  trackPageView,
} from './api.js'
import announcementPoster from './assets/scnu-sweet-girlfriend-poster.jpg'
import sponsorWechat from './assets/sponsor-wechat.jpg'
import sponsorAlipay from './assets/sponsor-alipay.jpg'
import naiwaLaughAudio from './assets/naiwa-laugh.m4a'

const NAV_ITEMS = [
  { id: 'home', label: '首页' },
  { id: 'about', label: '关于我们' },
  { id: 'join', label: '加入华师音游吹水群' },
  { id: 'find', label: '查找华师同好群' },
]

const RESULT_PAGE = 'group-results'
const ADMIN_PAGE = 'admin'
const GROUPS_PER_PAGE = 20

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

function NewFeaturesModal({ onClose }) {
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
          现在可以直接在小站提交华师同好群，申请、审核和公开展示都有着落啦。
        </p>
      </div>

      <article className="new-feature-card">
        <span>NEW</span>
        <div>
          <h3>同好群自助申请上线</h3>
          <p>
            点击“想要宣群？”，填写群名、相关游戏、QQ 群号和申请人 QQ 号即可提交。
            系统会自动检查重复群号，申请通过站长审核后才会展示在“查找华师同好群”中；
            申请人 QQ 号不会公开。
          </p>
        </div>
      </article>

      <div className="modal-actions">
        <button type="button" onClick={onClose}>下一步</button>
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
  const [pvCount, setPvCount] = useState(null)
  const pvTrackedRef = useRef(false)
  const [activeModal, setActiveModal] = useState(() =>
    getInitialRoute().page === ADMIN_PAGE ? '' : 'announcement',
  )

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
        ? '同好群管理 · 华南奶蛙师范大学'
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
    if (!activeModal) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveModal(getNextStartupModal)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeModal])

  const updateRoute = (page, query = '') => {
    const nextHash =
      page === RESULT_PAGE
        ? `#${RESULT_PAGE}?q=${encodeURIComponent(query)}`
        : `#${page}`

    window.history.pushState(null, '', nextHash)
    setRoute({ page, query })
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
            </>
          )}
        </div>
      </header>

      <main
        className={`site-main${isResultsPage ? ' site-main--results' : ''}${isAdminPage ? ' site-main--admin' : ''}`}
      >
        <div
          className={`content-panel${isResultsPage || isAdminPage ? ' content-panel--wide' : ''}${isAdminPage ? ' content-panel--admin' : ''}`}
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
        <p>华师音游同好 · 趣味制作</p>
        <p>非华南师范大学官方网站</p>
      </footer>

      {activeModal === 'announcement' && (
        <AnnouncementModal onClose={closeActiveModal} />
      )}
      {activeModal === 'new-features' && (
        <NewFeaturesModal onClose={closeActiveModal} />
      )}
      {activeModal === 'sponsor' && (
        <SponsorModal onClose={closeActiveModal} />
      )}
      {activeModal === 'promote' && (
        <PromoteGroupModal onClose={closeActiveModal} />
      )}
    </div>
  )
}
