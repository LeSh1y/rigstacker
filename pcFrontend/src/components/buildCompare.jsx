import React from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'

const API = 'http://localhost:3000/api'

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

function TopNav({ theme, setTheme }) {
  return (
    <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-line bg-ink-900/80 backdrop-blur-sm gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[15px] font-semibold tracking-tight text-fg">PCForge Compare</span>
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

function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function priceOf(item) {
  return numberOrNull(item?.price_eur ?? item?.price)
}

function itemName(item) {
  return item?.name ?? item?.title ?? '—'
}

function getItem(build, key) {
  if (!build) return null
  if (key === 'motherboard') return build.motherboard ?? build.mainboard ?? build.mobo ?? null
  if (key === 'case') return build.case ?? build.cases ?? null
  if (key === 'storage') return build.storage ?? build.ssd ?? null
  return build[key] ?? null
}

function labelUseCase(useCase) {
  const value = String(useCase ?? '').trim()
  if (!value) return null
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildTitle(snapshot) {
  if (snapshot?.title) return snapshot.title
  const useCase = labelUseCase(snapshot?.useCase)
  if (useCase) return `${useCase} Build`
  return `Build #${String(snapshot?.id ?? '').slice(0, 8) || 'saved'}`
}

function modeLabel(mode) {
  return mode === 'best_value' ? 'Best value' : mode === 'new' ? 'New' : '—'
}

function formatPrice(value) {
  const n = numberOrNull(value)
  return n == null ? '—' : `€${Math.round(n).toLocaleString()}`
}

function formatNumber(value, suffix = '') {
  const n = numberOrNull(value)
  return n == null ? '—' : `${Math.round(n * 100) / 100}${suffix}`
}

function statusClass(value) {
  if (value === true || value === 'ok' || value === 'balanced') return 'text-ok'
  if (value === false || value === 'critical' || value === 'bad') return 'text-bad'
  if (value === 'warning' || value === 'cpu_bottleneck' || value === 'gpu_bottleneck') return 'text-warn'
  return 'text-fg'
}

function usedPartsCount(build) {
  const keys = ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'cooler', 'case']
  return keys.reduce((count, key) => {
    const condition = String(getItem(build, key)?.pricing?.condition ?? '').toLowerCase()
    return count + (['used', 'refurbished', 'open_box'].includes(condition) ? 1 : 0)
  }, 0)
}

function savingsVsNew(build) {
  const keys = ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'cooler', 'case']
  return keys.reduce((sum, key) => {
    const item = getItem(build, key)
    const price = priceOf(item)
    const pct = numberOrNull(item?.pricing?.discount_pct)
    if (price == null || pct == null || pct <= 0 || pct >= 1) return sum
    return sum + (price * pct / (1 - pct))
  }, 0)
}

function normalizeBuildForCompare(snapshot) {
  const build = snapshot?.build ?? {}
  const health = snapshot?.buildHealth ?? {}
  const checks = health.checks ?? {}
  const power = checks.power ?? {}
  const cooling = checks.cooling ?? {}
  const fit = checks.fit ?? {}
  const storage = checks.storage ?? {}
  const bottleneck = snapshot?.bottleneck ?? {}
  const totalPrice = numberOrNull(snapshot?.totalPrice)
  const budgetTotal = numberOrNull(snapshot?.budgetTotal)
  const budgetOverflow = numberOrNull(snapshot?.budgetOverflow)

  const components = {
    CPU: getItem(build, 'cpu'),
    GPU: getItem(build, 'gpu'),
    Motherboard: getItem(build, 'motherboard'),
    RAM: getItem(build, 'ram'),
    Storage: getItem(build, 'storage'),
    PSU: getItem(build, 'psu'),
    Cooler: getItem(build, 'cooler'),
    Case: getItem(build, 'case'),
  }

  return {
    id: snapshot?.id,
    title: buildTitle(snapshot),
    totalPrice,
    budgetTotal,
    budgetDelta: budgetTotal == null || totalPrice == null ? null : budgetTotal - totalPrice,
    budgetOverflow,
    useCase: labelUseCase(snapshot?.useCase) ?? '—',
    pricingMode: modeLabel(snapshot?.pricingMode),
    compatible: snapshot?.compatible,
    issuesCount: Array.isArray(snapshot?.issues) ? snapshot.issues.length : 0,
    warningsCount: Array.isArray(snapshot?.warnings) ? snapshot.warnings.length : 0,
    bottleneckStatus: bottleneck.status ?? bottleneck.verdict ?? null,
    bottleneckDeltaPercent: numberOrNull(bottleneck.deltaPercent),
    cpuScore: numberOrNull(bottleneck.cpuScore),
    gpuScore: numberOrNull(bottleneck.gpuScore),
    bottleneckMessage: bottleneck.message ?? '—',
    buildHealthOverallStatus: health.overallStatus ?? null,
    estimatedDrawW: numberOrNull(power.estimatedDrawW),
    psuWattage: numberOrNull(power.psuWattage),
    psuHeadroomPercent: numberOrNull(power.headroomPercent),
    cpuTdp: numberOrNull(cooling.cpuTdp),
    coolerCapacity: numberOrNull(cooling.coolerMaxTdp),
    gpuLengthMm: numberOrNull(fit.gpuLengthMm),
    caseMaxGpuLengthMm: numberOrNull(fit.caseMaxGpuLengthMm),
    storageRecommendation: storage.message ?? '—',
    components: Object.fromEntries(
      Object.entries(components).map(([key, item]) => [
        key,
        {
          name: itemName(item),
          price: priceOf(item),
        },
      ])
    ),
    savingsVsNew: savingsVsNew(build),
    usedPartsCount: usedPartsCount(build),
  }
}

function cellTone(row, build, builds) {
  if (row.kind === 'price') {
    const prices = builds.map(item => item.totalPrice).filter(value => value != null)
    if (!prices.length || build.totalPrice == null) return ''
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (build.totalPrice === min) return 'text-ok'
    if (max > min * 1.05 && build.totalPrice === max) return 'text-warn'
  }

  if (row.kind === 'compatible') return statusClass(build.compatible)
  if (row.kind === 'health') return statusClass(build.buildHealthOverallStatus)
  if (row.kind === 'bottleneck') return statusClass(build.bottleneckStatus)
  if (row.kind === 'cpuScore' || row.kind === 'gpuScore') {
    const values = builds.map(item => item[row.key]).filter(value => value != null)
    if (values.length && build[row.key] === Math.max(...values)) return 'text-ok'
  }

  return ''
}

function Row({ label, row, builds }) {
  return (
    <div className="compare-row grid border-t border-line" style={{ gridTemplateColumns: `180px repeat(${builds.length}, minmax(210px, 1fr))` }}>
      <div className="px-3 py-2.5 mono text-[10.5px] uppercase tracking-widest text-fg-muted bg-ink-850/60">{label}</div>
      {builds.map(build => (
        <div key={build.id} className={"px-3 py-2.5 text-[12.5px] text-fg border-l border-line " + cellTone(row, build, builds)}>
          {row.render(build)}
        </div>
      ))}
    </div>
  )
}

function Section({ title, rows, builds }) {
  return (
    <section className="border border-line rounded-sm bg-ink-800 overflow-x-auto">
      <div className="px-3 py-2.5 border-b border-line bg-ink-850/60">
        <h2 className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">{title}</h2>
      </div>
      <div className="min-w-[720px]">
        {rows.map(row => <Row key={row.label} label={row.label} row={row} builds={builds} />)}
      </div>
    </section>
  )
}

function BuildComparePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = React.useState(() => getInitialTheme())
  const [phase, setPhase] = React.useState('loading')
  const [builds, setBuilds] = React.useState([])
  const [error, setError] = React.useState('')

  const ids = React.useMemo(() => {
    const params = new URLSearchParams(location.search)
    return (params.get('ids') ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .slice(0, 3)
  }, [location.search])

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage?.setItem('pcforge-theme', theme)
    } catch {}
  }, [theme])

  React.useEffect(() => {
    let active = true
    if (ids.length < 2) {
      setPhase('error')
      setError('Select 2 or 3 builds to compare.')
      return () => { active = false }
    }

    setPhase('loading')
    setError('')
    Promise.allSettled(ids.map(id => axios.get(`${API}/builds/${id}`, { timeout: 8000 })))
      .then(results => {
        if (!active) return
        const snapshots = results
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value.data?.data ?? result.value.data)
          .filter(Boolean)
          .map(normalizeBuildForCompare)
        if (snapshots.length < 2) {
          setError('Could not load enough builds to compare.')
          setPhase('error')
          return
        }
        setBuilds(snapshots)
        setPhase('done')
      })
      .catch(err => {
        if (!active) return
        console.error('Compare load failed', err)
        setError('Could not load comparison.')
        setPhase('error')
      })

    return () => {
      active = false
    }
  }, [ids])

  const rows = {
    summary: [
      { label: 'Total price', kind: 'price', render: build => formatPrice(build.totalPrice) },
      { label: 'Budget', render: build => formatPrice(build.budgetTotal) },
      { label: 'Budget left / over', render: build => build.budgetDelta == null ? '—' : (build.budgetDelta >= 0 ? `${formatPrice(build.budgetDelta)} left` : `${formatPrice(Math.abs(build.budgetDelta))} over`) },
      { label: 'Use case', render: build => build.useCase },
      { label: 'Pricing mode', render: build => build.pricingMode },
      { label: 'Compatible', kind: 'compatible', render: build => build.compatible ? 'Yes' : 'No' },
      { label: 'Build Health', kind: 'health', render: build => build.buildHealthOverallStatus ?? '—' },
      { label: 'Bottleneck', kind: 'bottleneck', render: build => build.bottleneckStatus ?? '—' },
    ],
    components: ['CPU', 'GPU', 'Motherboard', 'RAM', 'Storage', 'PSU', 'Cooler', 'Case'].map(name => ({
      label: name,
      render: build => (
        <div>
          <div className="truncate">{build.components[name]?.name ?? '—'}</div>
          <div className="mono text-[10.5px] text-fg-muted mt-0.5">{formatPrice(build.components[name]?.price)}</div>
        </div>
      ),
    })),
    performance: [
      { label: 'CPU score', key: 'cpuScore', kind: 'cpuScore', render: build => formatNumber(build.cpuScore) },
      { label: 'GPU score', key: 'gpuScore', kind: 'gpuScore', render: build => formatNumber(build.gpuScore) },
      { label: 'Delta', render: build => formatNumber(build.bottleneckDeltaPercent, '%') },
      { label: 'Balance message', render: build => build.bottleneckMessage },
    ],
    health: [
      { label: 'Estimated draw', render: build => formatNumber(build.estimatedDrawW, 'W') },
      { label: 'PSU wattage', render: build => formatNumber(build.psuWattage, 'W') },
      { label: 'PSU headroom', render: build => formatNumber(build.psuHeadroomPercent, '%') },
      { label: 'CPU TDP', render: build => formatNumber(build.cpuTdp, 'W') },
      { label: 'Cooler capacity', render: build => formatNumber(build.coolerCapacity, 'W') },
      { label: 'GPU length / case max', render: build => `${formatNumber(build.gpuLengthMm, 'mm')} / ${formatNumber(build.caseMaxGpuLengthMm, 'mm')}` },
      { label: 'Storage', render: build => build.storageRecommendation },
    ],
    value: [
      { label: 'Difference vs cheapest', render: build => {
        const prices = builds.map(item => item.totalPrice).filter(value => value != null)
        if (!prices.length || build.totalPrice == null) return '—'
        const diff = build.totalPrice - Math.min(...prices)
        return diff === 0 ? 'Cheapest' : `+${formatPrice(diff)}`
      } },
      { label: 'Savings vs new', render: build => build.savingsVsNew > 0 ? formatPrice(build.savingsVsNew) : '—' },
      { label: 'Used parts', render: build => formatNumber(build.usedPartsCount) },
      { label: 'Warnings', render: build => formatNumber(build.warningsCount) },
      { label: 'Issues', render: build => formatNumber(build.issuesCount) },
    ],
  }

  return (
    <div className="h-screen flex flex-col text-fg bg-ink-900">
      <TopNav theme={theme} setTheme={setTheme} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <div className="mono text-[10.5px] uppercase tracking-widest text-fg-dim mb-1">Decision tool</div>
              <h1 className="text-[20px] font-semibold tracking-tight text-fg">Compare builds</h1>
            </div>
            <button
              onClick={() => navigate('/builds')}
              className="h-9 px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line bg-ink-800 hover:bg-ink-750 hover:border-line-strong rounded-sm text-fg transition-colors">
              Back to Builds
            </button>
          </div>

          {phase === 'loading' && (
            <div className="border border-line rounded-sm bg-ink-800 p-8 text-center fade-up">
              <div className="mono text-[11px] uppercase tracking-widest text-fg-muted">Loading comparison</div>
            </div>
          )}

          {phase === 'error' && (
            <div className="border border-line rounded-sm bg-ink-800 p-8 text-center fade-up">
              <div className="text-[16px] font-semibold mb-2">{error}</div>
              <button onClick={() => navigate('/builds')} className="mono text-[10.5px] uppercase tracking-widest text-accent-hi hover:text-accent">
                Return to Builds
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-4">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${builds.length}, minmax(0, 1fr))` }}>
                {builds.map(build => (
                  <div key={build.id} className="border border-line rounded-sm bg-ink-800 p-3 min-w-0">
                    <div className="text-[14px] font-semibold text-fg truncate">{build.title}</div>
                    <div className="mono text-[10.5px] uppercase tracking-widest text-fg-muted mt-1">{formatPrice(build.totalPrice)}</div>
                  </div>
                ))}
              </div>

              <Section title="Summary" rows={rows.summary} builds={builds} />
              <Section title="Core components" rows={rows.components} builds={builds} />
              <Section title="Performance / balance" rows={rows.performance} builds={builds} />
              <Section title="Power / thermals / fit" rows={rows.health} builds={builds} />
              <Section title="Value signals" rows={rows.value} builds={builds} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export { normalizeBuildForCompare }
export default BuildComparePage
