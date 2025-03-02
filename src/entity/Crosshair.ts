import {
  CRITICAL_CHARGE_END_COLOR,
  CRITICAL_CHARGE_START_COLOR,
  DEFAULT_CHARGE_DURATION,
  INITIAL_ROTATION_SPEED,
  MAX_ROTATION_SPEED,
  MIN_CHARGE_CRITICAL_SPEED,
  MIN_CHARGE_END_COLOR,
  MIN_CHARGE_SPEED,
  MIN_CHARGE_START_COLOR,
} from '@/enums/constants.ts'
import { getChargeDuration } from '@/utils/chargeUtils.ts'
import { remap } from '@/utils/function.ts'
import { lerp } from 'three/src/math/MathUtils'
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, TextureLoader } from 'three'
import state from '@/states/GlobalState'
import SpellFire from '@/entity/SpellFire'

let singleton: any = null
export default () => {
  if (singleton !== null) return singleton
  singleton = {}

  const createCrosshair = () => {
    const textureLoader = new TextureLoader()
    const crosshair = textureLoader.load('images/crosshair/crosshair-transparent.png')
    crosshair.anisotropy = state.renderer.capabilities.getMaxAnisotropy()

    const crosshairSprite = new Sprite(
      new SpriteMaterial({
        map: crosshair,
        color: 0xffffff,
        fog: false,
        depthTest: false,
        depthWrite: false,
      })
    )

    state.addEvent('renderer.resize', () => {
      const aspect = innerWidth / innerHeight
      state.uiCamera.left = -aspect
      state.uiCamera.right = aspect
      state.uiCamera.top = 1
      state.uiCamera.bottom = -1
      state.uiCamera.updateProjectionMatrix()

      // Scale crosshair based on screen size
      const scaleFactor = Math.min(innerWidth, innerHeight) * 0.0015 * 0.15
      crosshairSprite.scale.set(scaleFactor, scaleFactor, 1)

      crosshairSprite.position.set(0, 0, -10)
      crosshairSprite.center.set(0.5, 0.5)
    })
    crosshairSprite.scale.set(0.15, 0.15, 1)
    crosshairSprite.position.set(0, 0, -10)
    crosshairSprite.center.set(0.5, 0.5)

    // load crosshair stars Texture
    const createPlaneFromTexture = (path: string) => {
      const texture = new TextureLoader().load(path)
      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      })

      const size = 0.18
      const geometry = new PlaneGeometry(size, size)
      const mesh = new Mesh(geometry, material)
      mesh.name = 'crosshairMesh'
      mesh.position.set(0, 0, 0) // Center it in the HUD
      return mesh
    }
    const crosshairStar = createPlaneFromTexture('images/crosshair/crosshair-stars.png')
    const crosshairDots = createPlaneFromTexture('images/crosshair/crosshair-dots.png')

    /* create groups */
    const crosshairGroup = new Group()
    crosshairGroup.add(crosshairSprite)
    const crosshairRotatingGroup = new Group()
    crosshairRotatingGroup.add(crosshairStar)
    crosshairRotatingGroup.add(crosshairDots)
    crosshairGroup.add(crosshairRotatingGroup)

    state.uiScene.add(crosshairGroup)
    crosshairDots.visible = false
    crosshairStar.visible = false

    return { crosshairRotatingGroup, crosshairStar, crosshairDots }
  }

  const { crosshairRotatingGroup, crosshairStar, crosshairDots } = createCrosshair()

  const entityChargeDuration = getChargeDuration(state.player)
  let rotationSpeed: number = INITIAL_ROTATION_SPEED
  let chargeStartTime: number = 0

  const { fireRaycaster } = SpellFire()

  let canFire = false
  let forcedSpellRelease = false

  /* release shot if attack button is released */
  state.addEvent('controls.attack1.up', () => {
    canFire && fireRaycaster(rotationSpeed, state.player, state.enemy)
    forcedSpellRelease = false
    canFire = false
    crosshairDots.visible = false
    crosshairStar.visible = false
    state.player.currentSpell.charge = 0
    state.player.destroyChargeIndicatorVFX(
      chargeIndicatorNebulaSystem,
      vfxRenderer,
      chargeIndicatorEventUuid,
      state.player
    )
    chargeIndicatorNebulaSystem = null
  })

  /* start charging spell on mouse down and hold */
  state.addEvent('controls.attack1.down', () => {
    canFire = false
    forcedSpellRelease = false
    crosshairDots.visible = false
    crosshairStar.visible = false
    chargeStartTime = Date.now()
  })
  let chargeIndicatorNebulaSystem: any = null
  let vfxRenderer: any = null
  let chargeIndicatorEventUuid: string = ''
  let firstCharge = true

  state.addEvent('renderer.update', async (deltaInS: number) => {
    const entity = state?.player
    if (!entity.currentSpell || !entity || entity.isDead()) return

    /* while attack button pressed => rotate crosshair */
    if (!state.controls.attack || forcedSpellRelease) return

    if (!chargeIndicatorNebulaSystem) {
      chargeIndicatorNebulaSystem = true
      const chargeVFX = await entity.createChargeIndicator(entity)
      chargeIndicatorNebulaSystem = chargeVFX.nebulaSystem
      chargeIndicatorEventUuid = chargeVFX.eventUuid
      vfxRenderer = chargeVFX.vfxRenderer
    }
    if (chargeIndicatorNebulaSystem) {
      entity.updateChargeIndicator(entity, rotationSpeed, chargeIndicatorNebulaSystem)
    }

    /* ~ 12 - 4 seconds */
    if (firstCharge) {
      chargeStartTime = Date.now()
      firstCharge = false
    }
    const elapsedChargeS = (Date.now() - chargeStartTime) / 1000
    const rotationDuration = remap(0, DEFAULT_CHARGE_DURATION, 0, entityChargeDuration, elapsedChargeS)
    const rotationN = Math.min(rotationDuration / entityChargeDuration, 1) // 0 - 1 -> value between [0,1]
    rotationSpeed = lerp(INITIAL_ROTATION_SPEED, MAX_ROTATION_SPEED, rotationN)
    state.player.currentSpell.charge = rotationN
    crosshairRotatingGroup.rotation.z -= rotationSpeed * deltaInS

    if (rotationSpeed > MIN_CHARGE_SPEED) {
      /* allow successful spell release */
      canFire = true
    }
    if (rotationSpeed < MIN_CHARGE_CRITICAL_SPEED) {
      crosshairStar.material.color.lerpColors(
        MIN_CHARGE_START_COLOR,
        MIN_CHARGE_END_COLOR,
        remap(0, 0.7, 0, 1, rotationN) /*
         */
      )
      crosshairDots.visible = false
      crosshairStar.visible = true
    } else if (rotationSpeed < MAX_ROTATION_SPEED) {
      /* switch to dots and blueish color */
      crosshairDots.material.color.lerpColors(
        CRITICAL_CHARGE_START_COLOR,
        CRITICAL_CHARGE_END_COLOR,
        remap(0.8, 1, 0.4, 1, rotationN) /*
         */
      )
      crosshairStar.visible = false
      crosshairDots.visible = true
    } else {
      /* spell overload -> forced release of the charged shot and receive damage */
      // console.log('rotationSpeed: ', rotationSpeed)
      fireRaycaster(rotationSpeed, state.player, state.enemy)
      canFire = false
      forcedSpellRelease = true
      state.player.currentSpell.charge = 0
      state.controls.previous.attack = false
      state.controls.attack = false
      crosshairDots.visible = false
      crosshairStar.visible = false
      state.player.destroyChargeIndicatorVFX(
        chargeIndicatorNebulaSystem,
        vfxRenderer,
        chargeIndicatorEventUuid,
        state.player
      )
      chargeIndicatorNebulaSystem = null
    }
  })
}
