import { lazy, Suspense, useMemo } from 'react'
import StudioLanding from './components/StudioLanding'

const ImmersiveExperience = lazy(() => import('./ImmersiveExperience'))

function App() {
  const showExperience = useMemo(
    () => new URLSearchParams(window.location.search).has('experience'),
    [],
  )

  if (showExperience) {
    return (
      <Suspense fallback={<div className="experience-loader">Entering the experience…</div>}>
        <ImmersiveExperience />
      </Suspense>
    )
  }

  return <StudioLanding />
}

export default App
