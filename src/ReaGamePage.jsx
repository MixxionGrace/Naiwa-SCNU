const DEFAULT_GAME_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:4175/'
  : 'https://run.milk-frog.cn/'

const GAME_URL = import.meta.env.VITE_REA_GAME_URL?.trim() || DEFAULT_GAME_URL

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.94c.46.08.63-.2.63-.44v-1.78c-2.56.56-3.1-1.08-3.1-1.08-.42-1.07-1.03-1.35-1.03-1.35-.84-.58.06-.57.06-.57.93.07 1.42.96 1.42.96.83 1.42 2.17 1.01 2.7.77.08-.6.32-1.01.59-1.24-2.04-.23-4.19-1.02-4.19-4.55 0-1 .36-1.82.95-2.46-.1-.23-.41-1.17.09-2.43 0 0 .78-.25 2.53.94A8.8 8.8 0 0 1 12 7.2a8.8 8.8 0 0 1 2.31.31c1.76-1.19 2.53-.94 2.53-.94.5 1.26.19 2.2.1 2.43.59.64.94 1.46.94 2.46 0 3.54-2.15 4.31-4.2 4.54.33.29.62.85.62 1.72v2.58c0 .24.17.53.63.44A9.2 9.2 0 0 0 12 2.8Z" />
    </svg>
  )
}

export default function ReaGamePage() {
  return (
    <section className="page page--rea-game" aria-labelledby="rea-game-title">
      <div className="rea-game-heading">
        <div>
          <p className="section-kicker">REA TEST · BROWSER RUNNER</p>
          <h1 id="rea-game-title">跑酷试玩</h1>
          <p>
            方向键换道、跳跃和翻滚；手机上直接滑动操作。游戏资源会在进入本页后单独加载。
          </p>
        </div>

        <div className="rea-game-heading__actions">
          <a href={GAME_URL} target="_blank" rel="noreferrer">
            <ExpandIcon />
            独立打开
          </a>
          <a
            className="rea-game-source"
            href="https://github.com/Nagiici/REA_Test"
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon />
            项目源码
          </a>
        </div>
      </div>

      <div className="rea-game-stage">
        <iframe
          src={GAME_URL}
          title="REA_Test 地铁跑酷浏览器试玩"
          allow="fullscreen; gamepad"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      </div>

      <p className="rea-game-note">
        试玩项目独立运行；首次打开需要加载约 70 MB 的三维资源，移动网络下建议稍等片刻。
      </p>
    </section>
  )
}
