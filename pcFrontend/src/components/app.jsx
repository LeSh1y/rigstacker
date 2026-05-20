import React from 'react'
import axios from 'axios'
import Sidebar from './sidebar.jsx'
import { EmptyState, BuildingState, BuildList, SummaryBar, SaveModal } from './output.jsx'
import * as I from './icons.jsx'

const API = 'http://localhost:3000/api'
const BUILD_PRICE_TYPES = [
  { key: 'cpu', apiType: 'cpu' },
  { key: 'gpu', apiType: 'gpu' },
  { key: 'mobo', apiType: 'mainboard' },
  { key: 'ram', apiType: 'ram' },
  { key: 'storage', apiType: 'storage' },
  { key: 'psu', apiType: 'psu' },
  { key: 'cooler', apiType: 'cooler' },
  { key: 'case', apiType: 'case' },
]

function normalizeBuild(build) {
  if (!build) return build

  return {
    cpu: build.cpu ?? null,
    gpu: build.gpu ?? null,
    motherboard: build.motherboard ?? build.mainboard ?? build.mobo ?? null,
    ram: build.ram ?? null,
    storage: build.storage ?? build.ssd ?? null,
    psu: build.psu ?? null,
    cooler: build.cooler ?? null,
    case: build.case ?? build.cases ?? null,
  }
}

function getBuildComponent(build, key) {
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

function buildTotal(build) {
  return BUILD_PRICE_TYPES.reduce((sum, { key }) => {
    const item = getBuildComponent(build, key)
    return sum + (priceOf(item) ?? 0)
  }, 0)
}

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

function getOrCreateSessionId() {
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
  const switchTimer = React.useRef(null)
  const options = [
    { key: 'dark', label: 'Dark' },
    { key: 'light', label: 'Light' },
  ]

  React.useEffect(() => {
    return () => {
      window.clearTimeout(switchTimer.current)
      document.documentElement.classList.remove('theme-switching')
    }
  }, [])

  function switchTheme(nextTheme) {
    if (nextTheme === theme) return

    const root = document.documentElement
    root.classList.add('theme-switching')
    window.clearTimeout(switchTimer.current)
    switchTimer.current = window.setTimeout(() => {
      root.classList.remove('theme-switching')
    }, 260)
    setTheme(nextTheme)
  }

  return (
    <div className="theme-toggle inline-flex rounded-sm border border-line bg-ink-850 p-0.5">
      {options.map(option => {
        const active = theme === option.key
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => switchTheme(option.key)}
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

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function componentSignature(item) {
  if (!item) return null

  return {
    id: item.id ?? null,
    name: item.name ?? item.title ?? null,
    price: priceOf(item),
    source: item.pricing?.source ?? item.source ?? null,
    condition: item.pricing?.condition ?? item.condition ?? null,
    offerUrl: item.pricing?.best_offer?.url ?? item.best_offer?.url ?? item.url ?? null,
  }
}

function createBuildSignature(snapshot) {
  const build = snapshot?.build ?? {}
  const componentState = Object.fromEntries(
    BUILD_PRICE_TYPES.map(({ key, apiType }) => [
      apiType,
      componentSignature(getBuildComponent(build, key)),
    ])
  )

  return stableStringify({
    build: componentState,
    totalPrice: snapshot?.totalPrice ?? null,
    budgetTotal: snapshot?.budgetTotal ?? null,
    useCase: snapshot?.useCase ?? null,
    pricingMode: snapshot?.pricingMode ?? null,
    compatible: snapshot?.compatible ?? null,
    bottleneck: snapshot?.bottleneck ? {
      status: snapshot.bottleneck.status ?? snapshot.bottleneck.verdict ?? null,
      cpuScore: snapshot.bottleneck.cpuScore ?? null,
      gpuScore: snapshot.bottleneck.gpuScore ?? null,
      deltaPercent: snapshot.bottleneck.deltaPercent ?? null,
    } : null,
    buildHealth: snapshot?.buildHealth ? {
      overallStatus: snapshot.buildHealth.overallStatus ?? null,
      checks: Object.fromEntries(
        Object.entries(snapshot.buildHealth.checks ?? {}).map(([key, check]) => [
          key,
          {
            status: check?.status ?? null,
            message: check?.message ?? null,
          },
        ])
      ),
    } : null,
  })
}

function anchorKeyFor(type) {
  return type === 'motherboard' || type === 'mainboard' ? 'mobo' : type
}

function requestKeyFor(type) {
  return type === 'mobo' || type === 'motherboard' ? 'mainboard' : type
}

const initialState = {
  budget: 1750,
  useCase: 'gaming',
  pricingMode: 'new',
  anchors: {}, // type-key -> { id, name }
};

function reducer(state, action) {
  switch (action.type) {
    case 'budget':  return { ...state, budget: action.value };
    case 'useCase': return { ...state, useCase: action.value };
    case 'pricingMode': return { ...state, pricingMode: action.value };
    case 'anchor':
      return { ...state, anchors: { ...state.anchors, [action.key]: action.value } };
    default: return state;
  }
}

function App() {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [sessionId] = React.useState(() => getOrCreateSessionId());
  const [theme, setTheme] = React.useState(() => getInitialTheme());
  const [phase, setPhase] = React.useState('empty'); // empty | building | done
  const [baseBuild, setBaseBuild] = React.useState(null);
  const [build, setBuild] = React.useState(null);
  const [isCompatible, setIsCompatible] = React.useState(true);
  const [issues, setIssues] = React.useState([]);
  const [warnings, setWarnings] = React.useState([]);
  const [bottleneck, setBottleneck] = React.useState(null);
  const [buildHealth, setBuildHealth] = React.useState(null);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState('');
  const [shareError, setShareError] = React.useState('');
  const [shareCopied, setShareCopied] = React.useState(false);
  const [shareSaving, setShareSaving] = React.useState(false);
  const [draftBuildId, setDraftBuildId] = React.useState(null);
  const [savedBuildId, setSavedBuildId] = React.useState(null);
  const [isDirty, setIsDirty] = React.useState(false);
  const [lastSavedSignature, setLastSavedSignature] = React.useState(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [swappingType, setSwappingType] = React.useState(null);
  const [swapError, setSwapError] = React.useState('');
  const buildRequestRef = React.useRef(0);
  const pricingRequestRef = React.useRef(0);
  const pricingCacheRef = React.useRef(new Map());

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage?.setItem('pcforge-theme', theme);
    } catch {}
  }, [theme]);

  function buildPricingKey(buildToPrice, mode) {
    const ids = BUILD_PRICE_TYPES
      .map(({ key, apiType }) => {
        const item = getBuildComponent(buildToPrice, key);
        return `${apiType}:${item?.id ?? 'none'}`;
      })
      .join('|');

    return `${mode}:${ids}`;
  }

  function applyRecommendationToItem(item, rec, mode) {
    const originalPrice = item.price_eur ?? item.price ?? null;
    const hasRealRecommendation = rec?.recommended_source && rec.recommended_source !== 'fallback';
    const nextPrice = hasRealRecommendation && rec?.recommended_price != null
      ? rec.recommended_price
      : originalPrice;

    return {
      ...item,
      price_eur: nextPrice,
      pricing: {
        mode: rec?.mode ?? mode,
        condition: hasRealRecommendation ? (rec?.recommended_condition ?? 'new') : 'new',
        source: hasRealRecommendation ? rec.recommended_source : 'configurator',
        discount_pct: hasRealRecommendation ? (rec?.discount_pct ?? null) : null,
        best_offer: hasRealRecommendation ? (rec?.best_offer ?? null) : null,
      },
    };
  }

  function mergePricingUpdates(buildToPrice, updates) {
    const next = { ...buildToPrice };

    for (const [key, item] of updates) {
      if (key === 'mobo') next.motherboard = item;
      else next[key] = item;
    }

    return normalizeBuild(next);
  }

  async function applyPricingSequentialFallback(buildToPrice, mode) {
    const updates = [];

    for (const { key, apiType } of BUILD_PRICE_TYPES) {
      const item = getBuildComponent(buildToPrice, key);
      if (!item?.id) {
        updates.push([key, item]);
        continue;
      }

      try {
        const res = await axios.get(`${API}/offers/${apiType}/${item.id}/recommendation`, {
          params: { mode },
          timeout: 7000,
        });
        const rec = res.data?.data ?? res.data;
        updates.push([key, applyRecommendationToItem(item, rec, mode)]);
      } catch (err) {
        console.warn('Pricing recommendation failed', apiType, item.id, err);
        updates.push([key, item]);
      }
    }

    return mergePricingUpdates(buildToPrice, updates);
  }

  async function applyPricingRecommendations(buildToPrice, mode) {
    if (!buildToPrice) return buildToPrice;

    const cacheKey = buildPricingKey(buildToPrice, mode);
    if (pricingCacheRef.current.has(cacheKey)) {
      return pricingCacheRef.current.get(cacheKey);
    }

    const components = BUILD_PRICE_TYPES
      .map(({ key, apiType }) => {
        const item = getBuildComponent(buildToPrice, key);
        return item?.id ? { key, type: apiType, id: item.id } : null;
      })
      .filter(Boolean);

    try {
      const res = await axios.post(`${API}/offers/recommendations`, {
        mode,
        components: components.map(({ type, id }) => ({ type, id })),
      }, { timeout: 10000 });

      const payload = res.data?.data ?? res.data;
      const byComponent = new Map(
        (payload?.recommendations ?? []).map((entry) => [`${entry.type}:${entry.id}`, entry])
      );

      const updates = BUILD_PRICE_TYPES.map(({ key, apiType }) => {
        const item = getBuildComponent(buildToPrice, key);
        if (!item?.id) return [key, item];

        const entry = byComponent.get(`${apiType}:${item.id}`);
        if (entry?.error || !entry?.recommendation) {
          if (entry?.error) console.warn('Pricing recommendation failed', apiType, item.id, entry.error);
          return [key, item];
        }

        return [key, applyRecommendationToItem(item, entry.recommendation, mode)];
      });

      const pricedBuild = mergePricingUpdates(buildToPrice, updates);
      pricingCacheRef.current.set(cacheKey, pricedBuild);
      return pricedBuild;
    } catch (err) {
      console.warn('Batch pricing recommendations failed; using sequential fallback', err);
      const pricedBuild = await applyPricingSequentialFallback(buildToPrice, mode);
      pricingCacheRef.current.set(cacheKey, pricedBuild);
      return pricedBuild;
    }
  }

  async function generate() {
    const buildRequestId = ++buildRequestRef.current;
    ++pricingRequestRef.current;
    setPhase('building');
    setBaseBuild(null);
    setBuild(null);
    setBottleneck(null);
    setBuildHealth(null);
    setIssues([]);
    setWarnings([]);
    setDraftBuildId(null);
    setSavedBuildId(null);
    setIsDirty(false);
    setLastSavedSignature(null);
    setShareUrl('');
    setShareError('');
    setShareCopied(false);
    setSwappingType(null);
    setSwapError('');

    try {
      const anchorIds = Object.fromEntries(
        Object.entries(state.anchors)
          .filter(([, v]) => v?.id)
          .map(([type, v]) => [`${requestKeyFor(type)}_id`, v.id])
      );
      const res = await axios.post(`${API}/configurator`, {
        budget: state.budget,
        useCase: state.useCase,
        pricingMode: state.pricingMode,
        ...anchorIds,
      });
      const data = res.data?.data ?? res.data;
      if (buildRequestRef.current !== buildRequestId) return;

      const configuratorBuild = normalizeBuild(data?.build ?? data);
      setBaseBuild(configuratorBuild);
      setBuild(configuratorBuild);
      setIsCompatible(data?.compatible ?? true);
      setIssues(data?.issues ?? []);
      setWarnings(data?.warnings ?? []);
      setBottleneck(data?.bottleneck ?? null);
      setBuildHealth(data?.buildHealth ?? null);
      setDraftBuildId(createUuid());
      setSavedBuildId(null);
      setIsDirty(true);
      setLastSavedSignature(null);
      setPhase('done');
    } catch (err) {
      if (buildRequestRef.current !== buildRequestId) return;
      console.error('Build failed', err);
      setPhase('empty');
    }
  }

  async function copyShareUrl(url) {
    if (!url) return false;
    try {
      await navigator.clipboard?.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1400);
      return true;
    } catch {
      setShareCopied(false);
      return false;
    }
  }

  function currentBuildSnapshot() {
    const totalPrice = Math.round(buildTotal(build) * 100) / 100;
    return {
      build,
      sessionId,
      draftBuildId,
      totalPrice,
      budgetTotal: state.budget,
      budgetOverflow: Math.max(0, Math.round((totalPrice - Number(state.budget)) * 100) / 100),
      useCase: state.useCase,
      pricingMode: state.pricingMode,
      compatible: isCompatible,
      issues,
      warnings,
      bottleneck,
      buildHealth,
    };
  }

  async function handleSave() {
    if (!build) return;
    setShareSaving(true);
    setShareError('');

    try {
      const snapshot = currentBuildSnapshot();
      const signature = createBuildSignature(snapshot);
      let id = savedBuildId && !isDirty && signature === lastSavedSignature ? savedBuildId : null;
      let url = id && shareUrl ? shareUrl : '';

      if (!id) {
        const saveRes = await axios.post(`${API}/builds`, snapshot);
        id = saveRes.data?.data?.id ?? saveRes.data?.id;
      }

      if (!url) {
        try {
          const shareRes = await axios.get(`${API}/builds/${id}/share`);
          url = shareRes.data?.data?.shareUrl ?? shareRes.data?.shareUrl;
        } catch {
          url = `${window.location.origin}/build/${id}`;
        }
      }

      setSavedBuildId(id);
      setLastSavedSignature(signature);
      setIsDirty(false);
      setShareUrl(url);
      setSaveOpen(true);
      await copyShareUrl(url);
    } catch (err) {
      console.error('Share failed', err);
      setShareError('Could not save this build right now.');
      setSaveOpen(true);
    } finally {
      setShareSaving(false);
    }
  }

  // Cmd/Ctrl + Enter to build
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault(); generate();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  React.useEffect(() => {
    if (phase !== 'done' || !baseBuild) return;

    const requestId = ++pricingRequestRef.current;
    applyPricingRecommendations(baseBuild, state.pricingMode)
      .then((pricedBuild) => {
        if (pricingRequestRef.current === requestId) {
          setBuild(pricedBuild);
          setIsDirty(true);
        }
      })
      .catch((err) => {
        console.warn('Pricing recommendations unavailable; keeping base build', err);
        if (pricingRequestRef.current === requestId) {
          setBuild(baseBuild);
          setIsDirty(true);
        }
      });
  }, [state.pricingMode, baseBuild, phase]);

  function lockToggle(k) {
    const anchorKey = anchorKeyFor(k);
    const component = getBuildComponent(build, k);

    if (state.anchors[anchorKey]) {
      dispatch({ type:'anchor', key:anchorKey, value:null });
      if (draftBuildId) setIsDirty(true);
    } else if (component) {
      dispatch({ type:'anchor', key:anchorKey, value:{ id: component.id, name: component.name } });
      if (draftBuildId) setIsDirty(true);
    }
  }

  async function handleSwap(k) {
    if (!build || swappingType) return;

    const anchorKey = anchorKeyFor(k);
    if (state.anchors[anchorKey]) return;

    const componentType = requestKeyFor(k);
    const anchorIds = Object.fromEntries(
      Object.entries(state.anchors)
        .filter(([, v]) => v?.id)
        .map(([type, v]) => [`${requestKeyFor(type)}_id`, v.id])
    );

    const requestId = ++pricingRequestRef.current;
    setSwappingType(anchorKey);
    setSwapError('');

    try {
      const res = await axios.post(`${API}/configurator/swap`, {
        build,
        componentType,
        budget: state.budget,
        useCase: state.useCase,
        pricingMode: state.pricingMode,
        anchors: anchorIds,
      });
      const data = res.data?.data ?? res.data;
      const swappedBuild = normalizeBuild(data?.build ?? data);
      const pricedBuild = await applyPricingRecommendations(swappedBuild, state.pricingMode);
      if (pricingRequestRef.current !== requestId) return;

      setBaseBuild(swappedBuild);
      setBuild(pricedBuild);
      setIsCompatible(data?.compatible ?? true);
      setIssues(data?.issues ?? []);
      setWarnings(data?.warnings ?? []);
      setBottleneck(data?.bottleneck ?? null);
      setBuildHealth(data?.buildHealth ?? null);
      if (draftBuildId) setIsDirty(true);
    } catch (err) {
      console.error('Swap failed', err);
      const message = err?.response?.data?.message ?? err?.response?.data?.error ?? 'No compatible alternative found.';
      setSwapError(message);
    } finally {
      if (pricingRequestRef.current === requestId) setSwappingType(null);
    }
  }

  React.useEffect(() => {
    if (phase === 'done' && draftBuildId) {
      setIsDirty(true);
    }
  }, [state.budget, state.useCase, state.pricingMode, state.anchors, phase, draftBuildId]);

  const saveStatus = !draftBuildId
    ? null
    : isDirty
    ? (savedBuildId ? 'modified' : 'unsaved')
    : 'saved';

  return (
    <div className="h-screen flex flex-col lg:flex-row text-fg">
      {/* Sidebar — desktop inline, mobile drawer */}
      <div className={"lg:static lg:translate-x-0 fixed inset-y-0 left-0 z-40 transition-transform duration-200 " +
        (mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <Sidebar state={state} dispatch={dispatch}
          onBuild={() => { setMobileOpen(false); generate(); }}
          building={phase === 'building'} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
             onClick={() => setMobileOpen(false)} />
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-ink-900">
        {/* Top bar */}
        <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-line bg-[var(--top-bg)] backdrop-blur-sm gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center border border-line rounded-xs text-fg-muted hover:text-fg">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16"/>
              </svg>
            </button>
            <span className="text-[15px] font-semibold tracking-tight text-fg">PC Build Configurator</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 mono text-[10px] text-fg-dim">
              <span className="w-1.5 h-1.5 rounded-full bg-ok"/>
              Catalog synced
            </div>
            <div className="w-px h-5 bg-line mx-1 hidden md:block"/>
            <button className="text-[12px] text-fg-muted hover:text-fg px-2 py-1 hidden sm:inline">Catalog</button>
            <a className="text-[12px] text-fg-muted hover:text-fg px-2 py-1 hidden sm:inline" href="/builds">Builds</a>
            <button className="text-[12px] text-fg-muted hover:text-fg px-2 py-1 hidden md:inline">Docs</button>
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button className="ml-1 w-7 h-7 rounded-full bg-ink-800 border border-line text-[11px] font-semibold flex items-center justify-center text-accent">
              MK
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {phase === 'empty' && <EmptyState budget={state.budget} useCase={state.useCase} />}
          {phase === 'building' && <BuildingState />}
          {phase === 'done' && build && (
            <BuildList build={build} anchors={state.anchors}
              bottleneck={bottleneck}
              buildHealth={buildHealth}
              onLock={lockToggle}
              onSwap={handleSwap}
              swappingType={swappingType}
              swapError={swapError} />
          )}

          {/* Spacer pushes summary to bottom even when content is short */}
          {phase === 'done' && <div className="flex-1"/>}

          {phase === 'done' && build && (
            <SummaryBar
              build={build}
              budget={state.budget}
              onSave={handleSave}
              isCompatible={isCompatible}
              pricingMode={state.pricingMode}
              saveLabel="Share build"
              saving={shareSaving}
              saveStatus={saveStatus}
            />
          )}
        </div>
      </main>

      <SaveModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        shareUrl={shareUrl}
        copied={shareCopied}
        onCopy={() => copyShareUrl(shareUrl)}
        error={shareError}
      />
    </div>
  );
}

export default App;
