import { Clock, WebGLRenderer } from 'three'
import * as THREE from 'three'
import { GPURenderer } from 'three-nebula'
import state from '@/states/GlobalState'

let renderer: any = null

export default () => {
  /* renderer is a Singleton */
  if (renderer !== null) {
    return renderer
  }

  const canvas: any = document.querySelector('canvas')
  renderer = new WebGLRenderer({
    canvas,
    antialias: true,
  })

  renderer.clock = new Clock()

  renderer.setPixelRatio(4)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  renderer.outputEncoding = (THREE as any).sRGBEncoding
  renderer.physicallyCorrectLights = true

  renderer.toneMapping = THREE.CineonToneMapping
  renderer.toneMappingExposure = 1.75

  const FIXED_TIME_STEP = 1 / 60 // 60 FPS baseline
  let accumulatedTime = 0

  const tick = () => {
    const deltaS = renderer.clock.getDelta()
    accumulatedTime += deltaS

    if (state.isPaused) {
      requestAnimationFrame(tick)
      return
    }

    while (accumulatedTime >= FIXED_TIME_STEP) {
      state.oneTimeEventsList.forEach(({ eventName, callback, cleanup }: any) => {
        if (eventName === 'renderer.update') {
          callback()
          cleanup()
        }
      })
      /* wait for the whole arena to load */
      // if (!state.isBattleInitialized) {
      //   accumulatedTime -= FIXED_TIME_STEP
      //   return
      // }
      // console.log('state.isBattleInitialized: ', state.isBattleInitialized)

      state.eventsMap?.['renderer.update']?.forEach(({ callback }: any) => {
        callback?.(FIXED_TIME_STEP, renderer.clock.getElapsedTime())
      })
      accumulatedTime -= FIXED_TIME_STEP
    }

    /* auto clear here to be able to render uiScene on top
     * of the animated object scene */
    renderer.autoClear = true
    renderer.render(state.scene, state.camera)
    renderer.autoClear = false
    if (state.showCrosshair) {
      renderer.clearDepth()
      renderer.render(state.uiScene, state.uiCamera)
    }

    requestAnimationFrame(tick)
  }

  const onWindowResize = () => {
    state.camera.aspect = innerWidth / innerHeight
    state.camera?.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    state.triggerEvent('renderer.resize')
  }

  window.addEventListener('resize', onWindowResize, false)

  /* start game loop */
  renderer.clock.elapsedTime = 0
  renderer.clock.start()
  tick()

  state.vfxRenderer = new GPURenderer(state.scene, THREE)

  state.renderer = renderer

  return renderer
}
