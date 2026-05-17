import React from 'react';
import './BuildHealthPanel.css';

/**
 * BuildHealthPanel
 *
 * Standalone, framework-free React component. Accepts the `buildHealth`
 * payload as a prop and renders the compact diagnostic strip.
 *
 * Props:
 *   buildHealth: {
 *     overallStatus: 'ok' | 'warning' | 'critical',
 *     checks: {
 *       compatibility?: { status },
 *       power?:         { status, estimatedDrawW, psuWattage, headroomPercent },
 *       cooling?:       { status, cpuTdp, coolerMaxTdp },
 *       fit?:           { status, gpuLengthMm, caseMaxGpuLengthMm },
 *       storage?:       { status, type },
 *     }
 *   }
 *
 * Renders nothing if `buildHealth` or `buildHealth.checks` is missing.
 */
export default function BuildHealthPanel({ buildHealth }) {
  if (!buildHealth || !buildHealth.checks) return null;

  const c = buildHealth.checks;
  const pct = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : '—';
  const watts = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}W` : '—';
  const mm = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}mm` : '—';

  // ── Data mapping: backend payload → compact UI strings ─────────────────
  // Each cell is optional; missing checks are filtered out so the strip
  // never renders a blank slot.
  const cells = [
    {
      key: 'compatibility',
      label: 'Compatibility',
      status: c.compatibility?.status || 'ok',
      // ok → "Compatible", anything else → "Conflict"
      primary: c.compatibility?.status === 'ok' ? 'Compatible' : 'Conflict',
      detail: null,
    },
    c.power && {
      key: 'power',
      label: 'Power',
      status: c.power.status || 'ok',
      // headroomPercent (47.06) → "47% headroom"
      primary: `${pct(c.power.headroomPercent)} headroom`,
      // estimatedDrawW / psuWattage → "450W / 850W"
      detail: `${watts(c.power.estimatedDrawW)} / ${watts(c.power.psuWattage)}`,
    },
    c.cooling && {
      key: 'cooling',
      label: 'Cooling',
      status: c.cooling.status || 'ok',
      // ok → "Good margin"; otherwise show the status verbatim
      primary: c.cooling.status === 'ok' ? 'Good margin' : 'Tight margin',
      // cpuTdp / coolerMaxTdp → "65W / 150W"
      detail: `${watts(c.cooling.cpuTdp)} / ${watts(c.cooling.coolerMaxTdp)}`,
    },
    c.fit && {
      key: 'fit',
      label: 'Fit',
      status: c.fit.status || 'ok',
      // ok → "Fits case"; otherwise → "Too tight"
      primary: c.fit.status === 'ok' ? 'Fits case' : 'Too tight',
      // gpuLengthMm / caseMaxGpuLengthMm → "GPU 336/405mm"
      detail: `GPU ${mm(c.fit.gpuLengthMm)} / ${mm(c.fit.caseMaxGpuLengthMm)}`,
    },
    c.storage && {
      key: 'storage',
      label: 'Storage',
      status: c.storage.status || 'ok',
      // ok → "Recommended"; warning → "NVMe recommended"
      primary: c.storage.status === 'ok' ? 'Recommended' : 'NVMe recommended',
      // storage.type → "HDD selected"
      detail: `${c.storage.type || '—'} selected`,
    },
  ].filter(Boolean);

  // ── Overall status + summary ──────────────────────────────────────────
  const warnings  = cells.filter(i => i.status === 'warning').length;
  const criticals = cells.filter(i => i.status === 'critical' || i.status === 'bad').length;
  const overall   = buildHealth.overallStatus ||
    (criticals ? 'critical' : warnings ? 'warning' : 'ok');

  const overallLabel = {
    ok:       'HEALTHY',
    warning:  'WARNING',
    critical: 'CRITICAL',
  }[overall] || 'HEALTHY';

  const summary =
    criticals ? `${criticals} issue${criticals === 1 ? '' : 's'} need attention` :
    warnings  ? `${warnings} improvement${warnings === 1 ? '' : 's'} recommended` :
                'All checks passed';

  return (
    <section className="build-health-panel" data-status={overall}>
      <header className="build-health-header">
        <div className="build-health-header-left">
          <span className="build-health-title">Build Health</span>
          <span className="build-health-pill" data-status={overall}>{overallLabel}</span>
        </div>
        <span className="build-health-summary">{summary}</span>
      </header>

      <div className="build-health-grid">
        {cells.map(({ key, ...cell }) => (
          <BuildHealthCell key={key} {...cell} />
        ))}
      </div>
    </section>
  );
}

function BuildHealthCell({ label, status, primary, detail }) {
  return (
    <div className="build-health-cell" data-status={status}>
      <div className="build-health-cell-label-row">
        <span className="build-health-dot" />
        <span className="build-health-cell-label">{label}</span>
      </div>
      <div className="build-health-cell-primary">{primary}</div>
      {detail && <div className="build-health-cell-detail">{detail}</div>}
    </div>
  );
}
