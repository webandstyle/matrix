import { useEffect, useMemo, useRef, useState } from 'react'
import { LanguageProvider } from './i18n/LanguageContext'
import Experience from './experience/Experience'
import ChooseSection from './components/ChooseSection'
import RabbitHole from './components/RabbitHole'
import ArrivalScene from './components/ArrivalScene'
import ChromaLab from './components/ChromaLab'
import Agency from './components/Agency'
import AgencyBuilding from './components/AgencyBuilding'

export default function ImmersiveExperience() {
  const chromaLab = useMemo(() => new URLSearchParams(window.location.search).has('chroma'), [])
  const buildingLab = useMemo(() => new URLSearchParams(window.location.search).has('building'), [])
  const progressRef = useRef(0)
  const entryRef = useRef(0)
  const rabbitRef = useRef(0)
  const arrivalRef = useRef(0)
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
