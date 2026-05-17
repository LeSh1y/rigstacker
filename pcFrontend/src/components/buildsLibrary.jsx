import React from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import * as I from './icons.jsx'

const API = 'http://localhost:3000/api'

function createUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function getSessionId() {
  try {
    const existing = window.localStorage?.getItem('pcforge_session_id')
    if (existing) return existing

    const next = createUuid()
    window.localStorage?.setItem('pcforge_session_id', next)
    return next
  } catch {
    return createUuid()
  }
}

function getInitialTheme() {
  try {
    const saved = window.localStorage?.getItem('pcforge-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  } catch {
    return 'dark'
  }
}

function ThemeToggle({ theme, setTheme }) {
  const options = [
    { key: 'dark', label: 'Dark' },
    { key: 'light', label: 'Light' },
  ]

  return (
    <div className="theme-toggle inline-flex rounded-sm border border-line bg-ink-850 p-0.5">
      {options.map(option => {
        const active = theme === option.key
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => setTheme(option.key)}
            className={[
              "px-2.5 py-1 mono text-[10.5px] uppercase tracking-widest rounded-xs border transition-colors",
              active
                ? "bg-accent-bg text-accent-hi border-line"
                : "text-fg-muted border-transparent hover:text-fg"
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function priceLabel(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `€${Math.round(n).toLocaleString()}` : '—'
}

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function modeLabel(mode) {
  return mode === 'best_value' ? 'Best value' : 'New'
}

function statusClass(status) {
  if (status === true || status === 'ok' || status === 'balanced') return 'text-ok border-line bg-ok-bg'
  if (status === 'warning' || status === 'cpu_bottleneck' || status === 'gpu_bottleneck') return 'text-warn border-line bg-warn-bg'
  if (status === false || status === 'critical' || status === 'bad') return 'text-bad border-line bg-bad-bg'
  return 'text-fg-muted border-line bg-ink-800'
}

function StatusPill({ label, status }) {
  return (
    <span className={"mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border rounded-xs " + statusClass(status)}>
      {label}
    </span>
  )
}

function TopNav({ theme, setTheme }) {
  return (
    <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-line bg-ink-900/80 backdrop-blur-sm gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[15px] font-semibold tracking-tight text-fg">PCForge Builds</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1.5 mono text-[10px] text-fg-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-ok"/>
          Catalog synced
        </div>
        <div className="w-px h-5 bg-line mx-1 hidden md:block"/>
        <a className="text-[12px] text-fg-muted hover:text-fg px-2 py-1 hidden sm:inline" href="/">Catalog</a>
        <a className="text-[12px] text-accent-hi px-2 py-1 hidden sm:inline" href="/builds">Builds</a>
        <button className="text-[12px] text-fg-muted hover:text-fg px-2 py-1 hidden md:inline">Docs</button>
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <button className="ml-1 w-7 h-7 rounded-full bg-ink-800 border border-line text-[11px] font-semibold flex items-center justify-center text-accent">
          MK
        </button>
      </div>
    </header>
  )
}

function BuildCard({
  build,
  onOpen,
  onShare,
  onDelete,
  onToggleCompare,
  selected,
  copiedId,
  sharingId,
  deletingId,
}) {
  const cpu = build.components?.cpu ?? 'CPU not listed'
  const gpu = build.components?.gpu ?? 'GPU not listed'

  return (
    <article className="card-glow bg-ink-800 border border-line rounded-sm p-4 fade-up">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-fg truncate">{build.title ?? 'Saved Build'}</h2>
            <StatusPill label={build.compatible ? 'Compatible' : 'Check'} status={build.compatible} />
            <StatusPill label={build.buildHealthStatus ?? 'Health —'} status={build.buildHealthStatus} />
          </div>

          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            <div className="border border-line rounded-xs bg-ink-850/50 px-3 py-2">
              <div className="mono text-[10px] uppercase tracking-widest text-fg-dim mb-1">CPU</div>
              <div className="text-[12.5px] text-fg truncate">{cpu}</div>
            </div>
            <div className="border border-line rounded-xs bg-ink-850/50 px-3 py-2">
              <div className="mono text-[10px] uppercase tracking-widest text-fg-dim mb-1">GPU</div>
              <div className="text-[12.5px] text-fg truncate">{gpu}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-fg-muted">
            <span className="mono uppercase tracking-widest">{build.useCase ?? 'custom'}</span>
            <span className="text-line-strong">·</span>
            <span className="mono uppercase tracking-widest">{modeLabel(build.pricingMode)}</span>
            <span className="text-line-strong">·</span>
            <span className="mono uppercase tracking-widest">{build.bottleneckStatus ?? 'bottleneck —'}</span>
            <span className="text-line-strong">·</span>
            <span>{dateLabel(build.createdAt)}</span>
          </div>
        </div>

        <div className="lg:text-right shrink-0">
          <div className="font-mono tnum text-[20px] font-semibold text-fg">{priceLabel(build.totalPrice)}</div>
          {Number(build.budgetOverflow) > 0 && (
            <div className="mono text-[10.5px] uppercase tracking-widest text-warn mt-1">
              +{priceLabel(build.budgetOverflow)} over
            </div>
          )}
          <div className="flex lg:justify-end gap-2 mt-4 flex-wrap">
            <button
              onClick={() => onOpen(build.id)}
              className="h-8 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-850 hover:bg-ink-750 hover:border-line-strong rounded-xs text-fg inline-flex items-center gap-1.5 transition-colors">
              Open
            </button>
            <button
              onClick={() => onShare(build.id)}
              disabled={sharingId === build.id}
              className="h-8 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-850 hover:bg-accent-bg hover:border-accent hover:text-accent-hi rounded-xs text-fg-muted inline-flex items-center gap-1.5 transition-colors disabled:opacity-60">
              <I.Share className="w-3.5 h-3.5" />
              {copiedId === build.id ? 'Copied' : sharingId === build.id ? 'Sharing' : 'Share'}
            </button>
            <button
              onClick={() => onToggleCompare(build.id)}
              className={[
                "h-8 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border rounded-xs inline-flex items-center gap-1.5 transition-colors",
                selected
                  ? "border-line bg-accent-bg text-accent-hi"
                  : "border-line bg-ink-850 text-fg-muted hover:bg-ink-750 hover:text-fg"
              ].join(' ')}>
              <span className={"w-3 h-3 border rounded-[2px] flex items-center justify-center " + (selected ? "border-accent bg-accent" : "border-line-strong")}>
                {selected && <I.Check className="w-2.5 h-2.5 text-ink-950" />}
              </span>
              Compare
            </button>
            <button
              onClick={() => onDelete(build.id)}
              disabled={deletingId === build.id}
              className="h-8 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-850 hover:bg-bad-bg hover:border-bad hover:text-bad rounded-xs text-fg-muted inline-flex items-center gap-1.5 transition-colors disabled:opacity-60">
              {deletingId === build.id ? 'Deleting' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function BuildsLibraryPage() {
  const navigate = useNavigate()
  const [theme, setTheme] = React.useState(() => getInitialTheme())
  const [sessionId] = React.useState(() => getSessionId())
  const [phase, setPhase] = React.useState('loading')
  const [builds, setBuilds] = React.useState([])
  const [error, setError] = React.useState('')
  const [copiedId, setCopiedId] = React.useState(null)
  const [sharingId, setSharingId] = React.useState(null)
  const [deletingId, setDeletingId] = React.useState(null)
  const [selectedIds, setSelectedIds] = React.useState([])
  const [selectionMessage, setSelectionMessage] = React.useState('')
  const [feedback, setFeedback] = React.useState('')

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage?.setItem('pcforge-theme', theme)
    } catch {}
  }, [theme])

  React.useEffect(() => {
    let active = true
    setPhase('loading')
    setError('')

    axios.get(`${API}/builds`, {
      params: { sessionId },
      timeout: 8000,
    })
      .then((res) => {
        if (!active) return
        setBuilds(res.data?.data ?? [])
        setPhase('done')
      })
      .catch((err) => {
        if (!active) return
        console.error('Build library failed', err)
        setError('Could not load saved builds.')
        setPhase('error')
      })

    return () => {
      active = false
    }
  }, [sessionId])

  async function shareBuild(id) {
    setSharingId(id)
    try {
      const res = await axios.get(`${API}/builds/${id}/share`, { timeout: 6000 })
      const url = res.data?.data?.shareUrl ?? res.data?.shareUrl ?? `${window.location.origin}/build/${id}`
      await navigator.clipboard?.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1600)
    } catch (err) {
      console.error('Build share failed', err)
      setCopiedId(null)
      window.prompt?.('Share URL', `${window.location.origin}/build/${id}`)
    } finally {
      setSharingId(null)
    }
  }

  function toggleCompare(id) {
    setSelectionMessage('')
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(item => item !== id)
      if (prev.length >= 3) {
        setSelectionMessage('Compare up to 3 builds.')
        return prev
      }
      return [...prev, id]
    })
  }

  function openCompare() {
    if (selectedIds.length < 2) return
    navigate(`/builds/compare?ids=${selectedIds.join(',')}`)
  }

  async function deleteBuild(id) {
    const confirmed = window.confirm(
      'Delete this saved build?\n\nThis only removes it from your saved builds. Shared links to this snapshot may stop working.'
    )
    if (!confirmed) return

    setDeletingId(id)
    setFeedback('')
    try {
      await axios.delete(`${API}/builds/${id}`, {
        params: { sessionId },
        timeout: 7000,
      })
      setBuilds(prev => prev.filter(build => build.id !== id))
      setSelectedIds(prev => prev.filter(item => item !== id))
      setFeedback('Build deleted.')
      setTimeout(() => setFeedback(''), 1800)
    } catch (err) {
      console.error('Delete build failed', err)
      setFeedback(err?.response?.status === 403 ? 'Delete denied for this session.' : 'Could not delete this build.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="h-screen flex flex-col text-fg bg-ink-900">
      <TopNav theme={theme} setTheme={setTheme} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <div className="mono text-[10.5px] uppercase tracking-widest text-fg-dim mb-1">Library</div>
              <h1 className="text-[20px] font-semibold tracking-tight text-fg">Saved builds</h1>
            </div>
            <a
              href="/"
              className="h-9 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-800 hover:bg-ink-750 hover:border-line-strong rounded-sm text-fg inline-flex items-center gap-2 transition-colors">
              <I.Bolt className="w-3.5 h-3.5" />
              Build my PC
            </a>
          </div>

          {phase === 'done' && builds.length > 0 && (
            <div className="mb-4 border border-line rounded-sm bg-ink-800 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted">
                  {selectedIds.length} selected
                </span>
                {selectionMessage && (
                  <span className="mono text-[10.5px] uppercase tracking-widest text-warn">{selectionMessage}</span>
                )}
                {feedback && (
                  <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted">{feedback}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openCompare}
                  disabled={selectedIds.length < 2}
                  className="h-8 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-850 hover:bg-accent-bg hover:border-accent hover:text-accent-hi rounded-xs text-fg disabled:text-fg-dim disabled:opacity-60 disabled:hover:bg-ink-850 disabled:hover:border-line transition-colors">
                  Compare
                </button>
                <button
                  onClick={() => {
                    setSelectedIds([])
                    setSelectionMessage('')
                  }}
                  disabled={selectedIds.length === 0}
                  className="h-8 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-850 hover:bg-ink-750 rounded-xs text-fg-muted disabled:opacity-50 transition-colors">
                  Clear selection
                </button>
              </div>
            </div>
          )}

          {phase === 'loading' && (
            <div className="border border-line rounded-sm bg-ink-800 p-8 text-center fade-up">
              <div className="mono text-[11px] uppercase tracking-widest text-fg-muted">Loading saved builds</div>
            </div>
          )}

          {phase === 'error' && (
            <div className="border border-line rounded-sm bg-ink-800 p-8 text-center fade-up">
              <div className="text-[16px] font-semibold mb-2">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="mono text-[10.5px] uppercase tracking-widest text-accent-hi hover:text-accent">
                Try again
              </button>
            </div>
          )}

          {phase === 'done' && builds.length === 0 && (
            <div className="border border-line rounded-sm bg-ink-800 p-8 text-center fade-up">
              <div className="text-[17px] font-semibold mb-2">No saved builds yet</div>
              <p className="text-[13px] text-fg-muted mb-5">Generate and share a build to save it here.</p>
              <button
                onClick={() => navigate('/')}
                className="cta-grad h-10 px-4 rounded-sm font-semibold text-[13px] inline-flex items-center gap-2">
                <I.Bolt className="w-4 h-4" />
                Build my PC
              </button>
            </div>
          )}

          {phase === 'done' && builds.length > 0 && (
            <div className="space-y-3">
              {builds.map(build => (
                <BuildCard
                  key={build.id}
                  build={build}
                  copiedId={copiedId}
                  sharingId={sharingId}
                  deletingId={deletingId}
                  selected={selectedIds.includes(build.id)}
                  onOpen={(id) => navigate(`/build/${id}`)}
                  onShare={shareBuild}
                  onDelete={deleteBuild}
                  onToggleCompare={toggleCompare}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default BuildsLibraryPage
