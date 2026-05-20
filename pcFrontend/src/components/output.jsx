import React from 'react'
import * as I from './icons.jsx'
import { COMPONENT_TYPES } from '../utils/mockData.js'
import BuildHealthPanel from './BuildHealthPanel.jsx'

const BUILD_ORDER = ['cpu', 'gpu', 'mobo', 'ram', 'storage', 'psu', 'cooler', 'case']
const TYPE_ALIASES = {
  motherboard: 'mobo',
  mainboard: 'mobo',
  mobo: 'mobo',
  cases: 'case',
  ssd: 'storage',
}

function canonicalTypeKey(key) {
  return TYPE_ALIASES[key] ?? key
}

function getBuildItem(build, key) {
  if (!build) return null

  if (key === 'mobo' || key === 'motherboard' || key === 'mainboard') {
    return build.motherboard ?? build.mainboard ?? build.mobo ?? null
  }

  if (key === 'case') {
    return build.case ?? build.cases ?? null
  }

  if (key === 'storage') {
    return build.storage ?? build.ssd ?? null
  }

  return build[key] ?? null
}

function priceOf(item) {
  const value = item?.price_eur ?? item?.price
  return value == null || Number.isNaN(Number(value)) ? null : Number(value)
}

function sourceLabel(source) {
  const key = String(source ?? '').toLowerCase()
  if (key === 'ebay') return 'eBay'
  if (key === 'mindfactory') return 'Mindfactory'
  if (key === 'geizhals') return 'Geizhals'
  if (key === 'fallback') return 'fallback'
  if (key === 'configurator') return 'configurator'
  return source ?? ''
}

function conditionLabel(condition) {
  if (condition === 'open_box') return 'open box'
  return condition || 'new'
}

function dealUrlOf(item) {
  const pricing = item?.pricing ?? {}
  const source = String(pricing.source ?? '').toLowerCase()
  const url = pricing.best_offer?.url ?? pricing.url ?? item?.best_offer?.url ?? item?.url ?? null

  if (!url || source === 'fallback' || source === 'configurator') return null
  return url
}

// Right output panel — empty state, build cards, summary bar

function EmptyState({ budget, useCase }) {
  return (
    <div className="flex-1 flex items-center justify-center px-8 py-12">
      <div className="max-w-md text-center fade-up">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 rounded-sm border border-line" />
          <div className="absolute inset-2 rounded-sm border border-accent/50 bg-ink-850 flex items-center justify-center border-breathe">
            <I.Bolt className="w-7 h-7 text-accent" />
          </div>
        </div>
        <h2 className="text-[20px] font-semibold tracking-tight mb-2">Configure your build</h2>
        <p className="text-[13px] text-fg-muted leading-relaxed mb-6">
          Set a budget, pick a use case, and RigStacker generates a fully compatible PC build in seconds.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-8">
          {[
            { n:'01', t:'Pick budget', d:'€200 – €5,000' },
            { n:'02', t:'Choose use case', d:'Gaming, work, more' },
            { n:'03', t:'Generate build', d:'Compatibility-checked' },
          ].map((s, i) => (
            <div key={i} className="border border-line rounded-sm p-3 text-left bg-ink-850/40">
              <div className="mono text-[10.5px] text-accent tracking-widest font-semibold mb-1.5">{s.n}</div>
              <div className="text-[12.5px] font-semibold mb-0.5">{s.t}</div>
              <div className="text-[11px] text-fg-muted">{s.d}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 inline-flex items-center gap-3 mono uppercase tracking-widest border border-line rounded-sm bg-ink-850/60 px-3 py-2">
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] text-fg-muted">Budget</span>
            <span className="tnum text-[12px] text-fg font-semibold">€{budget.toLocaleString()}</span>
          </span>
          <span className="w-px h-3 bg-line-strong" />
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] text-fg-muted">Use case</span>
            <span className="text-[12px] text-fg font-semibold">{useCase}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function CompatibilityBadge({ status }) {
  const map = {
    ok:   { c:'text-ok bg-ok-bg border-ok/30', t:'Compatible' },
    warn: { c:'text-warn bg-warn-bg border-warn/30', t:'Check' },
    bad:  { c:'text-bad bg-bad-bg border-bad/30', t:'Conflict' },
  }[status] || { c:'text-fg-muted bg-ink-800 border-line', t:'—' }

  return (
    <span className={"inline-flex items-center gap-1 mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border rounded-xs " + map.c}>
      <I.Check className="w-2.5 h-2.5" />
      {map.t}
    </span>
  )
}

function TypeAvatar({ type, size = 44, highlight = false }) {
  const dot = type.dot
  const lightFills = ['#f1f5f9', '#eab308', '#22c55e']
  const textOn = lightFills.includes(dot) ? '#051018' : '#ffffff'

  const baseStyle = highlight ? {
    width: size, height: size,
    background: dot,
    border: `1px solid ${dot}`,
    color: textOn,
    fontSize: size >= 44 ? 12 : 10.5,
  } : {
    width: size, height: size,
    background: 'var(--ink-700)',
    border: '1px solid var(--line-strong)',
    color: 'var(--fg)',
    fontSize: size >= 44 ? 12 : 10.5,
  }

  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center font-semibold mono tracking-tight"
      style={baseStyle}>
      {type.abbr}
    </div>
  )
}

function BuildCard({ type, item, locked, onLock, onSwap, index, primary }) {
  const price = priceOf(item)
  const pricing = item.pricing ?? {}
  const condition = pricing.condition ?? 'new'
  const isUsed = ['used', 'refurbished'].includes(condition)
  const isOpenBox = condition === 'open_box'
  const src = sourceLabel(pricing.source)
  const discount = pricing.discount_pct != null
    ? `-${Math.round(Number(pricing.discount_pct) * 100)}%`
    : null

  const pricingParts = isUsed
    ? ['used', src, discount].filter(Boolean)
    : isOpenBox
    ? ['open box', src, discount].filter(Boolean)
    : ['new', src, discount].filter(Boolean)

  const pricingColor = (isUsed || isOpenBox) ? 'text-warn/90' : 'text-fg-muted'
  const dealUrl = dealUrlOf(item)

  return (
    <div
      className={"card-glow group relative bg-ink-800 border border-line rounded-sm transition-all fade-up " +
                 (primary ? "is-primary p-5" : "p-4")}
      style={{ animationDelay: `${index * 40}ms` }}>
      <div className="flex items-start gap-4">
        <TypeAvatar type={type} size={primary ? 48 : 40} highlight={locked} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">{type.label}</span>
            {item.compat && <>
              <span className="text-line-strong">·</span>
              <CompatibilityBadge status={item.compat} />
            </>}
            {locked && (
              <span className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-widest text-accent-hi bg-accent-bg border border-line px-1.5 py-0.5 rounded-xs">
                <I.Lock className="w-2.5 h-2.5"/> Anchored
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className={(primary ? "text-[16px]" : "text-[15px]") + " font-semibold text-fg truncate"}>{item.name}</div>
            {dealUrl && (
              <a
                href={dealUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Open product offer"
                className="shrink-0 mono text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 border border-line rounded-xs text-fg-muted hover:text-accent-hi hover:bg-accent-bg hover:border-accent hover:shadow-[0_0_18px_-10px_rgba(47,128,237,0.45)] transition-all"
              >
                <span className="hidden sm:inline">View deal </span>↗
              </a>
            )}
          </div>
          {item.spec && <div className="mono text-[11.5px] text-fg-muted mt-1">{item.spec}</div>}
        </div>

        <div className="text-right shrink-0">
          <div className={"font-mono tnum font-semibold " + (primary ? "text-[18px] text-fg" : "text-[16px] text-fg")}>
            {price == null ? '—' : `€${Math.round(price)}`}
          </div>
          {pricingParts.length > 0 && (
            <div className={"mono text-[10.5px] uppercase tracking-wider mt-1 whitespace-nowrap " + pricingColor}>
              {pricingParts.join(' · ')}
            </div>
          )}
          <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onSwap} title="Swap"
              className="w-7 h-7 flex items-center justify-center border border-line rounded-xs text-fg-muted hover:text-fg hover:border-line-strong">
              <I.Refresh className="w-3.5 h-3.5"/>
            </button>
            <button onClick={onLock} title={locked ? "Unlock" : "Lock"}
              className={"w-7 h-7 flex items-center justify-center border rounded-xs " +
                (locked ? "border-line text-accent-hi bg-accent-bg" : "border-line text-fg-muted hover:text-fg hover:border-line-strong")}>
              {locked ? <I.Lock className="w-3.5 h-3.5"/> : <I.Unlock className="w-3.5 h-3.5"/>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LegacyBottleneckIndicator({ cpu, gpu }) {
  const diff = (gpu.perf || 0) - (cpu.perf || 0)
  const abs = Math.abs(diff)

  let status, label, detail
  if (abs <= 12)        { status='ok';   label='BALANCED';   detail='CPU and GPU performance match — no bottleneck.' }
  else if (diff > 12)   { status='warn'; label='CPU-LIMITED';detail=`GPU is ${abs}pp stronger than CPU.` }
  else                  { status='warn'; label='GPU-LIMITED';detail=`CPU is ${abs}pp stronger than GPU.` }

  const cpuPct = Math.min(100, Math.max(0, cpu.perf))
  const gpuPct = Math.min(100, Math.max(0, gpu.perf))

  return (
    <div className="relative my-1 px-4 py-3.5 border border-dashed border-line-strong rounded-sm bg-ink-850/60 fade-up">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="mono text-[9.5px] uppercase tracking-widest text-fg-dim">Bottleneck</span>
          <span className={
            "mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-xs " +
            (status==='ok' ? "text-ok bg-ok-bg" : "text-warn bg-warn-bg")
          }>{label}</span>
        </div>
        <span className="font-mono tnum text-[11px] text-fg-muted">Δ {diff > 0 ? '+' : ''}{diff}pp</span>
      </div>

      <div className="bottleneck-track relative h-2.5 rounded-sm overflow-hidden border">
        <div className="bottleneck-fill-muted absolute inset-y-0 left-0" style={{ width: cpuPct + '%' }} />
        <div className="bottleneck-fill-muted absolute inset-y-0 right-0" style={{ width: (100 - gpuPct) + '%' }} />
        <div className="bottleneck-midline absolute inset-y-0 left-1/2 w-px" />
        <div className="bottleneck-point absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2"
             style={{ left: `calc(${cpuPct}% - 6px)` }} title={`CPU ${cpuPct}`} />
        <div className="bottleneck-point absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2"
             style={{ left: `calc(${gpuPct}% - 6px)` }} title={`GPU ${gpuPct}`} />
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          <span className="mono text-[10px] uppercase tracking-widest text-fg-dim">CPU</span>
          <span className="font-mono tnum text-[14px] font-bold text-fg">{cpu.perf}</span>
        </div>
        <div className="mono text-[10px] text-fg-dim text-center px-2">{detail}</div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono tnum text-[14px] font-bold text-fg">{gpu.perf}</span>
          <span className="mono text-[10px] uppercase tracking-widest text-fg-dim">GPU</span>
        </div>
      </div>
    </div>
  )
}

function BottleneckPanel({ bottleneck }) {
  const hasData = bottleneck && Number.isFinite(Number(bottleneck.cpuScore)) && Number.isFinite(Number(bottleneck.gpuScore))
  const statusMap = {
    balanced: { label: 'Balanced', c: 'text-ok bg-ok-bg' },
    cpu_bottleneck: { label: 'CPU bottleneck', c: 'text-warn bg-warn-bg' },
    gpu_bottleneck: { label: 'GPU bottleneck', c: 'text-warn bg-warn-bg' },
  }
  const mapped = statusMap[bottleneck?.status] ?? { label: 'Unavailable', c: 'text-fg-muted bg-ink-800' }

  if (!hasData) {
    return (
      <div className="relative my-1 px-4 py-3.5 border border-dashed border-line-strong rounded-sm bg-ink-850/60 fade-up">
        <div className="flex items-center gap-2">
          <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">Bottleneck</span>
          <span className="mono text-[10.5px] uppercase tracking-widest px-1.5 py-0.5 rounded-xs text-fg-muted bg-ink-800">Unavailable</span>
        </div>
        <div className="text-[12.5px] text-fg-muted mt-2">Bottleneck analysis unavailable</div>
      </div>
    )
  }

  const cpuScore = Math.max(0, Number(bottleneck.cpuScore))
  const gpuScore = Math.max(0, Number(bottleneck.gpuScore))
  const maxScore = Math.max(cpuScore, gpuScore, 1)
  const cpuPct = Math.max(6, Math.min(100, (cpuScore / maxScore) * 100))
  const gpuPct = Math.max(6, Math.min(100, (gpuScore / maxScore) * 100))
  const delta = Math.max(0, Math.round(Number(bottleneck.deltaPercent ?? 0)))

  return (
    <div className="relative my-1 px-4 py-3.5 border border-dashed border-line-strong rounded-sm bg-ink-850/60 fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">Bottleneck</span>
          <span className={"mono text-[10.5px] uppercase tracking-widest px-1.5 py-0.5 rounded-xs " + mapped.c}>{mapped.label}</span>
        </div>
        <span className="font-mono tnum text-[11.5px] text-fg-muted">Delta {delta}%</span>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[40px_1fr_48px] items-center gap-2">
          <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">CPU</span>
          <div className="bottleneck-track h-2 rounded-sm overflow-hidden border">
            <div className="bottleneck-fill h-full" style={{ width: cpuPct + '%' }} />
          </div>
          <span className="font-mono tnum text-[12px] text-fg text-right">{cpuScore}</span>
        </div>
        <div className="grid grid-cols-[40px_1fr_48px] items-center gap-2">
          <span className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">GPU</span>
          <div className="bottleneck-track h-2 rounded-sm overflow-hidden border">
            <div className="bottleneck-fill-muted h-full" style={{ width: gpuPct + '%' }} />
          </div>
          <span className="font-mono tnum text-[12px] text-fg text-right">{gpuScore}</span>
        </div>
      </div>

      <div className="text-[12px] text-fg-muted mt-3 leading-relaxed">{bottleneck.message}</div>
    </div>
  )
}

function BuildList({ build, anchors, bottleneck, buildHealth, onLock, onSwap }) {
  return (
    <div className="px-6 py-6">
      <div className="space-y-2.5">
        {BUILD_ORDER.map((k, i) => {
          const t = COMPONENT_TYPES.find(t => t.key === canonicalTypeKey(k))
          const item = getBuildItem(build, k)
          if (!item) return null

          const primary = (k === 'cpu' || k === 'gpu')
          const card = (
            <BuildCard
              key={k}
              type={t}
              item={item}
              locked={!!anchors[canonicalTypeKey(k)]}
              onLock={() => onLock(k)}
              onSwap={() => onSwap(k)}
              index={i}
              primary={primary}
            />
          )

          if (k === 'cpu') {
            return [
              card,
              <BottleneckPanel key="bn" bottleneck={bottleneck} />,
              <BuildHealthPanel key="health" buildHealth={buildHealth} />,
            ]
          }

          return card
        })}
      </div>
    </div>
  )
}

function SummaryBar({ build, budget, onSave, isCompatible, pricingMode, saveLabel = 'Share build', saving = false, hideAction = false, saveStatus = null }) {
  const components = BUILD_ORDER
    .map(k => getBuildItem(build, k))
    .filter(c => c && c !== null)
  const total = components.reduce((sum, c) => sum + (priceOf(c) ?? 0), 0)
  const remaining = Number(budget) - total
  const overBudget = remaining < 0
  const compatible = isCompatible ?? components.every(c => c.compat === 'ok')

  let totalSaved = 0
  if (pricingMode === 'best_value') {
    for (const c of components) {
      const pct = c.pricing?.discount_pct
      const price = priceOf(c)
      if (pct != null && price != null) {
        const ratio = Number(pct)
        if (ratio > 0 && ratio < 1) totalSaved += price * ratio / (1 - ratio)
      }
    }
  }

  return (
    <div className="sticky bottom-0 bg-[var(--summary-bg)] backdrop-blur-sm border-t border-line">
      <div className="px-6 py-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-6 flex-1 min-w-0 flex-wrap">
          <Stat label="Total" value={`€${Math.round(total).toLocaleString()}`} />
          <Divider />
          {overBudget ? (
            <div className="leading-tight">
              <div className="mono text-[10.5px] uppercase tracking-widest text-warn font-semibold">Status</div>
              <div className="mt-1 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-warn" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r="0.6" fill="currentColor"/>
                </svg>
                <span className="font-mono tnum text-[15px] font-semibold text-warn">
                  Over budget by €{Math.round(Math.abs(remaining)).toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="leading-tight">
              <div className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">Budget left</div>
              <div className="font-mono tnum text-[18px] font-semibold mt-1 text-ok">
                €{Math.round(remaining).toLocaleString()}
              </div>
            </div>
          )}
          <Divider />
          <div className="leading-tight">
            <div className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">Compatible</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={"w-1.5 h-1.5 rounded-full " + (compatible ? "bg-ok" : "bg-bad")}/>
              <span className={"text-[15px] font-semibold " + (compatible ? "text-ok" : "text-bad")}>
                {compatible ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          {pricingMode === 'best_value' && totalSaved >= 5 && (
            <>
              <Divider />
              <div className="leading-tight">
                <div className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">Saved vs new</div>
                <div className="font-mono tnum text-[16px] font-semibold mt-1 text-ok">
                  €{Math.round(totalSaved).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>
        {saveStatus && <SaveStatusPill status={saveStatus} />}
        {!hideAction && (
          <button
            onClick={onSave}
            disabled={saving}
            className="h-10 px-4 mono text-[11px] uppercase tracking-widest font-semibold border border-line bg-ink-800 hover:bg-ink-750 hover:border-accent hover:text-accent-hi rounded-sm text-fg inline-flex items-center gap-2 transition-colors">
            <I.Share className="w-3.5 h-3.5" /> {saving ? 'Saving...' : saveLabel}
          </button>
        )}
      </div>
      <div className="h-0.5 bg-ink-850">
        <div className={"h-full transition-all " + (overBudget ? "bg-warn" : "bg-accent")}
             style={{ width: Math.min(100, (total / budget) * 100) + '%' }}/>
      </div>
    </div>
  )
}

function SaveStatusPill({ status }) {
  const map = {
    unsaved: { label: 'Unsaved', c: 'text-fg-muted border-line bg-ink-800' },
    saved: { label: 'Saved', c: 'text-ok border-ok/30 bg-ok-bg' },
    modified: { label: 'Modified', c: 'text-warn border-warn/35 bg-warn-bg' },
  }
  const item = map[status] ?? map.unsaved

  return (
    <span className={"mono text-[10.5px] uppercase tracking-widest font-semibold px-2 py-1 border rounded-xs " + item.c}>
      {item.label}
    </span>
  )
}

function Stat({ label, value }) {
  return (
    <div className="leading-tight">
      <div className="mono text-[10.5px] uppercase tracking-widest text-fg-muted font-semibold">{label}</div>
      <div className="font-mono tnum text-[18px] font-semibold mt-1 text-fg">
        {value}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="h-8 w-px bg-line hidden sm:block" />
}

function BuildingState() {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="text-center">
        <div className="relative w-12 h-12 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full border-2 border-line" />
          <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
        <div className="mono text-[11px] uppercase tracking-widest text-fg-muted font-semibold mb-1.5">Computing</div>
        <div className="text-[15px] font-medium">Selecting compatible parts…</div>
        <div className="mono text-[11px] text-fg-muted mt-2">Sockets · TDP · clearance · power</div>
      </div>
    </div>
  )
}

function SaveModal({ open, onClose, shareUrl, copied: externalCopied, onCopy, error }) {
  const [copied, setCopied] = React.useState(false)
  const link = shareUrl || ''
  const isCopied = externalCopied || copied

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 fade-up"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-ink-800 border border-line-strong rounded-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <I.Share className="w-4 h-4 text-accent"/>
            <span className="text-[13px] font-semibold">Build saved</span>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg"><I.X className="w-4 h-4"/></button>
        </div>
        <div className="p-5">
          <p className="text-[12.5px] text-fg-muted leading-relaxed mb-4">
            Share this link - anyone can view your build.
          </p>
          {error && (
            <div className="mb-3 text-[12px] text-bad border border-bad/30 bg-bad-bg px-3 py-2 rounded-xs">
              {error}
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 font-mono text-[12px] px-3 py-2.5 bg-ink-900 border border-line rounded-xs text-fg truncate">
              {link || 'Unable to create share link'}
            </div>
            <button
              disabled={!link}
              onClick={() => {
                if (onCopy) {
                  onCopy()
                  return
                }
                navigator.clipboard?.writeText(link)
                setCopied(true)
                setTimeout(()=>setCopied(false), 1400)
              }}
              className="px-3 mono text-[10.5px] uppercase tracking-widest font-semibold border border-line-strong bg-ink-800 hover:bg-ink-750 rounded-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              {isCopied ? <><I.Check className="w-3.5 h-3.5 text-ok"/> Copied</> : <><I.Copy className="w-3.5 h-3.5"/> Copy</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export {
  EmptyState,
  BuildList,
  SummaryBar,
  BuildingState,
  SaveModal,
}
