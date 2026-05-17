import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ConfiguratorApp from './components/app.jsx'
import SharedBuildPage from './components/sharedBuild.jsx'
import BuildsLibraryPage from './components/buildsLibrary.jsx'
import BuildComparePage from './components/buildCompare.jsx'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConfiguratorApp />} />
        <Route path="/builds" element={<BuildsLibraryPage />} />
        <Route path="/builds/compare" element={<BuildComparePage />} />
        <Route path="/build/:id" element={<SharedBuildPage />} />
        <Route path="*" element={<ConfiguratorApp />} />
      </Routes>
    </BrowserRouter>
  )
}
