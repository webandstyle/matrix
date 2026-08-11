import { useEffect, useMemo, useRef, useState } from 'react'
import { LanguageProvider } from './i18n/LanguageContext'
import Experience from './experience/Experience'
import ChooseSection from './components/ChooseSection'
import RabbitHole from './components/RabbitHole'
import ArrivalScene from './components/ArrivalScene'
import ChromaLab from './components/ChromaLab'
import Agency from './components/Agency'
import AgencyBuilding from './components/AgencyBuilding'

function App() {
  // ?chroma: an isolated preview of the "Chromatic Journey" GLB — a candidate
  // replacement for the RabbitHole tube. Skips the whole journey so we can test
  // the model + how to travel through it in isolation (see ChromaLab.jsx).
  const chromaLab = useMemo(() => new URLSearchParams(window.location.search).has('chroma'), [])
  // ?building — the new cinematic building experience for #agency (under
  // construction; the live #agency page stays untouched until it's ready)
  const buildingLab = useMemo(() => new URLSearchParams(window.location.search).has('building'), [])

  // one shared scroll timeline drives the whole page as a single continuous
  // canvas: progressRef = the hero journey, entryRef = the stage entrance,
  // rabbitRef = the rabbit-hole dive → tube, arrivalRef = the arrival (dark
  // void, "Choose your Path", the pill-hand surfacing) → choice. All are
  // written by the Experience ScrollDriver and read by the fixed layers, so no
  // section ever scrolls up from below.
  const progressRef = useRef(0)
  const entryRef = useRef(0)
  const rabbitRef = useRef(0)
  const arrivalRef = useRef(0)

  // the BLUE PILL: #agency mounts the studio page as a full-screen takeover over
  // the journey (the pill-hand / choice cards set window.location.hash='#agency').
  // Clearing the hash returns to the experience.
  const [agency, setAgency] = useState(() => window.location.hash === '#agency')
  useEffect(() => {
    const onHash = () => setAgency(window.location.hash === '#agency')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (chromaLab) return <ChromaLab />
  if (buildingLab) {
    return (
      <LanguageProvider>
        <AgencyBuilding onClose={() => { window.location.href = window.location.pathname }} />
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider>
      <div className="grain-overlay" aria-hidden="true" />
      <Experience
        progressRef={progressRef}
        entryRef={entryRef}
        rabbitRef={rabbitRef}
        arrivalRef={arrivalRef}
      />
      <ChooseSection progressRef={progressRef} entryRef={entryRef} />
      <RabbitHole rabbitRef={rabbitRef} />
      <ArrivalScene arrivalRef={arrivalRef} />
      {agency && <Agency onClose={() => { window.location.hash = '' }} />}
    </LanguageProvider>
  )
}

export default App
