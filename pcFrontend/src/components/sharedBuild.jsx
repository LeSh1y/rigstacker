import React from 'react'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import { BuildList, BuildingState, SummaryBar } from './output.jsx'

const API = 'http://localhost:3000/api'

function SharedBuildPage() {
  const { id } = useParams()
  const [phase, setPhase] = React.useState('loading')
  const [snapshot, setSnapshot] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let active = true
    setPhase('loading')
    setError('')

    axios.get(`${API}/builds/${id}`)
      .then((res) => {
        if (!active) return
        setSnapshot(res.data?.data ?? res.data)
        setPhase('done')
      })
      .catch((err) => {
        if (!active) return
        const status = err?.response?.status
        setError(status === 404 ? 'Build not found.' : 'Could not load this shared build.')
        setPhase('error')
      })

    return () => {
      active = false
    }
  }, [id])

  return (
    <div className="h-screen flex flex-col text-fg bg-ink-900">
      <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between border-b border-line bg-ink-900/80 backdrop-blur-sm gap-3">
        <Link to="/" aria-label="Go to RigStacker home" className="flex items-center gap-3 min-w-0 cursor-pointer">
          <span className="text-[15px] font-semibold tracking-tight text-fg">RigStacker Shared Build</span>
        </Link>
        <a className="text-[12px] text-fg-muted hover:text-fg px-2 py-1" href="/">Build your own</a>
      </header>

      {phase === 'loading' && <BuildingState />}

      {phase === 'error' && (
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-md text-center fade-up">
            <div className="mono text-[11px] uppercase tracking-widest text-fg-dim mb-2">Shared build</div>
            <div className="text-[18px] font-semibold mb-2">{error}</div>
            <a className="text-[12px] text-accent-hi hover:text-accent" href="/">Return to configurator</a>
          </div>
        </div>
      )}

      {phase === 'done' && snapshot?.build && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <BuildList
            build={snapshot.build}
            anchors={{}}
            bottleneck={snapshot.bottleneck}
            buildHealth={snapshot.buildHealth}
            onLock={() => {}}
            onSwap={() => {}}
          />
          <div className="flex-1" />
          <SummaryBar
            build={snapshot.build}
            budget={snapshot.budgetTotal ?? snapshot.totalPrice ?? 0}
            isCompatible={snapshot.compatible}
            pricingMode={snapshot.pricingMode ?? 'new'}
            saveStatus="saved"
            hideAction
          />
        </div>
      )}
    </div>
  )
}

export default SharedBuildPage
