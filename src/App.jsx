import { useRef } from 'react'
import { LanguageProvider } from './i18n/LanguageContext'
import Experience from './experience/Experience'
import ChooseSection from './components/ChooseSection'
import RabbitHole from './components/RabbitHole'
import ArrivalScene from './components/ArrivalScene'

function App() {
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
    </LanguageProvider>
  )
}

export default App
