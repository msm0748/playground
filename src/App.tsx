import { useCamera } from './camera/useCamera'

function App() {
  const { videoRef, state, start, restart } = useCamera()

  return (
    <main className="app">
      <h1>Hand Frame Cell Shade</h1>
      <p>Webcam demo placeholder — gesture tracking and cell shading coming soon.</p>

      <video ref={videoRef} playsInline muted />
      {state.status === 'idle' && (
        <button type="button" onClick={() => void start()}>
          카메라 허용
        </button>
      )}
      {state.status === 'requesting' && <p>카메라 권한 요청 중…</p>}
      {state.status === 'error' && (
        <>
          <p role="alert">{state.errorMessage}</p>
          <button type="button" onClick={() => void restart()}>
            다시 시도
          </button>
        </>
      )}
    </main>
  )
}

export default App
