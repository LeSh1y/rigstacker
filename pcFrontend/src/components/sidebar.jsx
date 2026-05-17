import React from 'react'
import * as I from './icons.jsx'
import { USE_CASES, COMPONENT_TYPES, CATALOG } from '../utils/mockData.js'
import axios from 'axios'

// Left input panel: budget, use case, anchors, build CTA

// Maps component type key → key in /search results object
const RESULTS_KEY = {
  cpu: 'cpus', gpu: 'gpus', mobo: 'mainboards', motherboard: 'mainboards', mainboard: 'mainboards',
  ram: 'ram', psu: 'psus', case: 'cases', cooler: 'coolers', storage: 'storage',
}

const DEFAULT_SEARCHES = {
  cpu: ['Ryzen', 'Intel'],
  gpu: ['RTX'],
  ram: ['DDR5 32GB'],
  mobo: ['B650'],
  storage: ['Samsung 990', 'SN850X'],
  psu: ['850W'],
  cooler: ['Noctua', 'Arctic'],
  case: ['Fractal', 'Lian Li'],
}

const SEARCH_EXAMPLES = {
  gpu: ['4060', '4070', '5080', '7600', '7900'],
  cpu: ['7600', '9700', '13600', '14900'],
  mobo: ['B650', 'Z790', 'Tomahawk', 'Prime'],
  motherboard: ['B650', 'Z790', 'Tomahawk', 'Prime'],
  mainboard: ['B650', 'Z790', 'Tomahawk', 'Prime'],
  ram: ['DDR5', '6000', '32GB'],
  storage: ['NVMe', 'SSD', '2TB'],
  psu: ['650W', '850W'],
  cooler: ['Pure Rock', 'Dark Rock'],
  case: ['Fractal', 'Pop Air', 'North'],
}

function itemPrice(item) {
  return item?.price_eur ?? item?.price ?? null
}

function itemLabel(item) {
  return item?.name ?? item?.title ?? ''
}

function formatPrice(value) {
  return value == null ? null : `€${Math.round(value)}`
}

function anchorLabel(anchor) {
  if (!anchor) return 'None — auto-fill'
  const price = formatPrice(itemPrice(anchor))
  return price ? `${itemLabel(anchor)} · ${price}` : itemLabel(anchor)
}

function normalizeItem(item) {
  return {
    ...item,
    name: itemLabel(item),
    price_eur: itemPrice(item),
  }
}

function matchesQuery(item, query, type) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  const haystack = [
    item?.name,
    item?.title,
    item?.brand_name,
    item?.brand,
    item?.type,
    item?.component_type,
    type?.label,
    type?.key,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(needle)
}

function BudgetSlider({ value, onChange }) {
  const min = 200, max = 5000, step = 50
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <label className="text-[11px] uppercase tracking-[0.16em] text-fg-muted font-semibold">Budget</label>
        <div className="mono tnum text-[11px] text-fg-muted">€{min.toLocaleString()} — €{max.toLocaleString()}</div>
      </div>

      <div className="flex items-baseline gap-2 mb-4">
        <span className="mono tnum text-3xl font-semibold text-fg leading-none">€{value.toLocaleString()}</span>
        <span className="mono text-[11px] uppercase tracking-widest text-fg-muted">EUR</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="pc-range"
        style={{ '--pct': pct + '%' }}
      />

      <div className="flex justify-between mt-2.5">
        {[200, 1000, 2500, 5000].map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={"mono text-[10.5px] tracking-wide transition-colors " + (value === v ? "text-accent-hi" : "text-fg-muted hover:text-fg")}
          >
            €{v >= 1000 ? (v / 1000) + 'k' : v}
          </button>
        ))}
      </div>
    </div>
  )
}

function PricingModeSwitch({ value, onChange }) {
  const modes = [
    { key: 'new', label: 'New' },
    { key: 'best_value', label: 'Best value' },
  ]

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.16em] text-fg-muted font-semibold mb-2">Pricing</label>

      <div className="inline-flex w-full rounded-sm border border-line bg-ink-850 p-0.5">
        {modes.map(mode => {
          const active = value === mode.key
          return (
            <button
              key={mode.key}
              onClick={() => onChange(mode.key)}
              className={[
                "flex-1 py-2 px-2.5 rounded-xs text-left transition-all",
                active
                  ? "bg-accent-bg border border-line shadow-[0_0_12px_rgba(0,212,255,0.12)]"
                  : "border border-transparent hover:bg-ink-750"
              ].join(' ')}
            >
              <div className={"mono text-[11px] uppercase tracking-widest font-semibold " + (active ? "text-accent-hi" : "text-fg")}>
                {mode.label}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function UseCaseGrid({ value, onChange }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.16em] text-fg-muted font-semibold mb-3">Use case</label>

      <div className="grid grid-cols-2 gap-2">
        {USE_CASES.map(uc => {
          const Icon = uc.Icon
          const active = value === uc.key

          return (
            <button
              key={uc.key}
              onClick={() => onChange(uc.key)}
              className={[
                "uc-card group relative text-left px-3 py-3.5 rounded-sm border transition-all overflow-hidden",
                active
                  ? "is-active border-line-strong bg-accent-bg"
                  : "border-line bg-ink-800 hover:border-line-strong hover:bg-ink-750"
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-2.5">
                <Icon className={"w-5 h-5 transition-colors " + (active ? "text-accent" : "text-fg-muted")} />

                {uc.key === 'gaming' && (
                  <div className="flex items-end gap-[2px] h-3 w-4 opacity-70">
                    <span className="fps-bar w-[2px] bg-fg-muted h-full" />
                    <span className="fps-bar w-[2px] bg-fg-muted h-full" />
                    <span className="fps-bar w-[2px] bg-fg-muted h-full" />
                    <span className="fps-bar w-[2px] bg-fg-muted h-full" />
                  </div>
                )}
              </div>

              <div className="text-[13.5px] font-semibold tracking-tight text-fg">{uc.label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AnchorRow({ type, anchor, onSet, onClear }) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [items, setItems] = React.useState([])
  const wrapRef = React.useRef(null)

  React.useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(id)
  }, [q])

  React.useEffect(() => {
    if (!open) { setItems([]); return }

    let cancelled = false
    const controller = new AbortController()
    const key = RESULTS_KEY[type.key]
    const query = debouncedQ.trim()

    function localItems() {
      return (CATALOG[type.key] ?? [])
        .slice(0, 12)
        .map(normalizeItem)
        .filter(item => matchesQuery(item, query, type))
        .slice(0, 4)
    }

    async function searchTerm(term) {
      const r = await axios.get('http://localhost:3000/api/search', {
        params: { q: term, type: type.key },
        signal: controller.signal,
        timeout: 6000,
      })
      const results = r.data?.results ?? r.data?.data?.results ?? {}
      return results[key] ?? []
    }

    async function loadItems() {
      try {
        if (query) {
          if (query.length < 2) {
            if (!cancelled) setItems(localItems())
            return
          }

          const found = (await searchTerm(query))
            .map(normalizeItem)
            .filter(item => matchesQuery(item, query, type))
            .slice(0, 8)

          if (!cancelled) setItems(found.length ? found : localItems())
          return
        }

        const terms = DEFAULT_SEARCHES[type.key] ?? []
        const batches = await Promise.all(terms.map(searchTerm))
        const seen = new Set()
        const defaults = batches
          .flat()
          .filter(item => {
            if (seen.has(item.id)) return false
            seen.add(item.id)
            return true
          })
          .slice(0, 4)
          .map(normalizeItem)

        if (!cancelled) {
          setItems(defaults.length ? defaults : (CATALOG[type.key] ?? []).slice(0, 4).map(normalizeItem))
        }
      } catch {
        if (!cancelled) {
          setItems(query ? localItems() : (CATALOG[type.key] ?? []).slice(0, 4).map(normalizeItem))
        }
      }
    }

    loadItems()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [debouncedQ, open, type])

  const c = type.dot
  const visibleItems = q.trim()
    ? items.filter(item => matchesQuery(item, q, type))
    : items

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 w-[88px] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
          <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted font-semibold">{type.label}</div>
        </div>

        <button
          onClick={() => setOpen(v => !v)}
          className={[
            "flex-1 min-w-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-sm border text-left transition-colors",
            anchor ? "bg-ink-800" : "border-line bg-ink-850 hover:border-line-strong"
          ].join(' ')}
          style={anchor ? { borderColor: c + '80', borderLeft: `2px solid ${c}` } : {}}
        >
          <span className={"text-[12.5px] truncate " + (anchor ? "text-fg" : "text-fg-muted")}>
            {anchorLabel(anchor)}
          </span>

          {anchor ? (
            <span
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
              className="shrink-0 text-fg-muted hover:text-fg cursor-pointer p-0.5"
            >
              <I.X className="w-3 h-3" />
            </span>
          ) : (
            <I.Chevron className={"w-3 h-3 text-fg-muted transition-transform " + (open ? "rotate-90" : "")} />
          )}
        </button>
      </div>

      {open && (
        <div className="absolute left-[96px] right-0 top-[calc(100%+4px)] z-30 bg-ink-800 border border-line-strong rounded-sm shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-line">
            <I.Search className="w-3.5 h-3.5 text-fg-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${type.label.toLowerCase()}...`}
              className="bg-transparent text-[12.5px] text-fg placeholder-fg-dim outline-none flex-1"
            />
          </div>

          <div className="max-h-52 overflow-y-auto">
            {visibleItems.length === 0 && (
              <div className="px-3 py-4 text-center">
                {q.trim().length < 2 ? (
                  <div className="text-[11.5px] text-fg-muted">No suggestions</div>
                ) : (
                  <>
                    <div className="text-[12px] text-fg-muted font-medium">No matches</div>
                    {(SEARCH_EXAMPLES[type.key] ?? []).length > 0 && (
                      <div className="mono text-[10px] text-fg-dim mt-1.5 tracking-wide">
                        {(SEARCH_EXAMPLES[type.key] ?? []).slice(0, 4).join(' · ')}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {visibleItems.map(it => (
              <button
                key={it.id}
                onClick={() => {
                  onSet(normalizeItem(it))
                  setOpen(false)
                  setQ('')
                }}
                className="w-full text-left px-2.5 py-2 hover:bg-ink-750 border-b border-line last:border-b-0"
              >
                <div className="text-[12.5px] text-fg truncate">{it.name}</div>

                <div className="flex items-center justify-between mt-0.5">
                  <div className="mono text-[10.5px] text-fg-muted truncate">{it.brand_name ?? it.spec ?? ''}</div>
                  <div className="mono tnum text-[11px] text-fg shrink-0 ml-2">
                    {formatPrice(itemPrice(it)) ?? ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AnchorPanel({ anchors, setAnchor, clearAnchor }) {
  const count = Object.values(anchors).filter(Boolean).length

  return (
    <details className="group">
      <summary className="flex items-center justify-between py-2 -my-2">
        <div className="flex items-center gap-2">
          <I.Chevron className="chev w-3 h-3 text-fg-muted" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-fg-muted font-semibold">
            Anchor components
          </span>
        </div>

        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="mono tnum text-[10.5px] text-accent-hi bg-accent-bg border border-line px-1.5 py-0.5 rounded-xs">
              {count} locked
            </span>
          )}

          <I.Lock className="w-3.5 h-3.5 text-fg-muted" />
        </div>
      </summary>

      <p className="text-[11.5px] text-fg-muted mt-2 mb-3 leading-relaxed">
        Lock parts you already own.
      </p>

      <div className="space-y-2">
        {COMPONENT_TYPES.map(t => (
          <AnchorRow
            key={t.key}
            type={t}
            anchor={anchors[t.key]}
            onSet={(it) => setAnchor(t.key, it)}
            onClear={() => clearAnchor(t.key)}
          />
        ))}
      </div>
    </details>
  )
}

function Sidebar({ state, dispatch, onBuild, building }) {
  return (
    <aside className="w-[88vw] max-w-[400px] lg:w-[360px] xl:w-[400px] shrink-0 border-r border-line bg-ink-900 flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-line">
        <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-accent to-accent-lo flex items-center justify-center text-ink-950">
          <I.Logo className="w-4 h-4" />
        </div>

        <div className="text-[14px] font-semibold tracking-tight">PCForge</div>

        <span className="ml-auto mono text-[10.5px] tracking-widest text-fg-muted border border-line px-1.5 py-0.5 rounded-xs">DE</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
        <BudgetSlider
          value={state.budget}
          onChange={(v) => dispatch({ type: 'budget', value: v })}
        />

        <PricingModeSwitch
          value={state.pricingMode}
          onChange={(v) => dispatch({ type: 'pricingMode', value: v })}
        />

        <UseCaseGrid
          value={state.useCase}
          onChange={(v) => dispatch({ type: 'useCase', value: v })}
        />

        <div className="border-t border-line pt-6">
          <AnchorPanel
            anchors={state.anchors}
            setAnchor={(k, v) => dispatch({ type: 'anchor', key: k, value: v })}
            clearAnchor={(k) => dispatch({ type: 'anchor', key: k, value: null })}
          />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-line bg-ink-900">
        <button
          onClick={onBuild}
          disabled={building}
          className="cta-grad relative w-full h-11 rounded-sm font-semibold text-[13px] tracking-wide flex items-center justify-center gap-2 disabled:opacity-80 disabled:cursor-wait"
        >
          {building ? (
            <>
              <I.Refresh className="w-4 h-4 animate-spin" />
              <span>Computing build…</span>
            </>
          ) : (
            <>
              <I.Bolt className="w-4 h-4" />
              <span>Build my PC</span>
              <span className="mono text-[10.5px] opacity-70 ml-1 px-1.5 py-0.5 rounded-xs bg-black/25 border border-white/10">⌘ ↵</span>
            </>
          )}
        </button>

      </div>
    </aside>
  )
}

export default Sidebar
