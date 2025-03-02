import sound from '@/engine/Sound.ts'
import SpellFire from '@/entity/SpellFire.ts'
import {
  DEFAULT_CHARGE_DURATION,
  ENDURANCE_REGEN_SPEED,
  INITIAL_ROTATION_SPEED,
  MAX_ROTATION_SPEED,
  MIN_CHARGE_CRITICAL_SPEED,
  MIN_CHARGE_END_COLOR,
  MIN_CHARGE_SPEED,
  MIN_CHARGE_START_COLOR,
} from '@/enums/constants.ts'
import state from '@/states/GlobalState.ts'
import type { ControllerUtils } from '@/types/entity.ts'
import { getChargeDuration } from '@/utils/chargeUtils.ts'
import { calcRapierMovementVector } from '@/utils/collision.ts'
import { createDebugBox, createRayTrace, remap } from '@/utils/function.ts'
import { removePath } from '@/utils/navigation.ts'
import { createVFX, destroyRenderer } from '@/utils/vfx.ts'
import { clamp, lerp } from 'three/src/math/MathUtils'
import { Color, type Quaternion, Raycaster, Vector3 } from 'three'
import { v4 as uuidv4 } from 'uuid'

export const getBaseStats: any = () => ({
  uuid: uuidv4(),
  hp: 100,
  previousHp: 100,
  maxHp: 100,
  mp: 100,
  previousMp: 100,
  maxMp: 100,
  endurance: 100,
  previousEndurance: 100,
  maxEndurance: 100,
  enduranceRegen: 1,
  currentSpell: {
    name: 'shot',
    speed: 1,
    damage: 25,
    charge: 0 /* [0,1] */,
  },
  isGrounded: false,
  appliedFlyImpulse: 0,
  colliderRadius: 0.5,
  isMoving: false,
  utils: {
    takeOffFrames: 0,
    groundedTime: {
      value: 0,
      lastTimeNotGrounded: Date.now(),
    },
  },
})

export const controllerUtils = (): ControllerUtils => ({
  getPosition(): Vector3 {
    if (!this.mesh) {
      return new Vector3(0, 0, 0)
    }
    return this.mesh?.position
  },
  getRotation() {
    return this.mesh.quaternion
  },
  setRotation(rotation: Quaternion) {
    if (!this.mesh) {
      return
    }
    const prevQuat = this.mesh.quaternion.clone()
    prevQuat.slerp(rotation, 0.2) // Smooth interpolation
    this.rigidBody.setRotation(prevQuat)
    return this.mesh.quaternion.copy(prevQuat)
  },
  isAnimState(stateName: string): boolean {
    return this.stateMachine.currentState.name === stateName
  },
  calcHalfHeightPosition(entity: any): Vector3 {
    return entity.mesh.position.clone().add(new Vector3(0, entity.halfHeight, 0))
  },
})

export const statsUtils = () => {
  let didDamage = false
  const TIME_INTERVAL = 6

  return {
    dealDamage(target: any, damage: number) {
      target.previousHp = target.hp
      target.hp = clamp(target.hp - damage, 0, target.maxHp)
    },
    dealMpDamage(target: any, damage: number) {
      target.previousMp = target.mp
      target.mp = clamp(target.mp - damage, 0, target.maxMp)
    },
    dealEnduranceDamage(target: any, damage: number) {
      target.previousEndurance = target.endurance
      target.endurance = clamp(target.endurance - damage, 0, target.maxEndurance)
    },
    addHp(target: any, heal: number) {
      target.previousHp = target.hp + heal
      target.hp = clamp(target.hp + heal, 0, target.maxHp)
    },
    updateLife(target: any, elapsedTimeInS: number) {
      if (!didDamage && elapsedTimeInS % TIME_INTERVAL < 1.0) {
        // this.dealDamage(target, -23)
        this.dealMpDamage(target, 12)
        didDamage = true
      } else if (didDamage && elapsedTimeInS % TIME_INTERVAL > TIME_INTERVAL - 1.0) {
        didDamage = false
      }
    },
    updateEndurance(target: any, deltaS: number) {
      if (target.stateMachine.currentState.name !== 'fly' && target.utils.groundedTime.value > 0.5) {
        this.dealEnduranceDamage(target, -ENDURANCE_REGEN_SPEED * target.enduranceRegen * deltaS)
      }
    },
    isDead(target: any) {
      return target?.hp <= 0
    },
    die(entity: any, deltaS: number) {
      const targetScale = 0.001
      const scaleFactor = 0.93
      const position: Vector3 = entity.mesh.position.clone()
      position.setY(position.y + 0.1)

      createVFX(position, 'deathStar', true /*, () => console.log('vfx finished: ')}*/)
      removePath()

      const deathEventUuid: string = state.addEvent('renderer.update', () => {
        const mesh = entity.mesh
        const originalScale = entity.mesh.scale.clone()

        /* shrink body mesh to target scale */
        if (mesh.scale.x > targetScale) {
          const scale = originalScale.y * scaleFactor
          mesh.scale.set(scale, scale, scale)
        }
        if (entity.mesh.scale.y < targetScale) {
          state.removeEvent('renderer.update', deathEventUuid)
          entity.mesh.geometry?.dispose()
          entity.mesh.material?.dispose()
          state.scene.remove(entity.mesh)
          // console.log('%c is dying: ', 'color: violet')
        }
      })

      entity.utils.takeOffFrames = 0
      entity.lastCoverPosition = null
      entity.path = null
      const movementVector = calcRapierMovementVector(entity, new Vector3(0, 0, 0), deltaS)
      entity.rigidBody.setNextKinematicTranslation(movementVector)

      state.sounds.addAndPlayPositionalSound(entity, 'death', { volume: 0.5 })
      /* cleanup all sound effects on the character */
      const soundsGroup = entity.mesh.children.find((child: any) => child.name === 'sounds-group')
      if (soundsGroup) {
        soundsGroup.children.forEach((child: any) => soundsGroup.remove(child))
      }
    },
  }
}

export const chargeUtils = () => ({
  async chargeAttack(entity: any, target: any) {
    if (entity.currentSpell.charge > 0) return
    entity.currentSpell.charge += 0.00001

    const entityChargeDuration = getChargeDuration(entity)
    let rotationSpeed: number = INITIAL_ROTATION_SPEED
    const chargeStartTime: number = Date.now()

    const { fireRaycaster } = SpellFire()
    entity.currentSpell.canFire = false
    entity.currentSpell.forcedSpellRelease = false
    const {
      eventUuid: chargeIndicatorEventUuid,
      nebulaSystem,
      vfxRenderer,
    } = await entity.createChargeIndicator(entity)

    const chargingUuid = state.addEvent('renderer.update', () => {
      if (!entity.currentSpell || entity.currentSpell.forcedSpellRelease) return

      /* ~ 12 - 4 seconds */
      const elapsedChargeS = (Date.now() - chargeStartTime) / 1000
      const rotationDuration = remap(0, DEFAULT_CHARGE_DURATION, 0, entityChargeDuration, elapsedChargeS)

      const rotationN = Math.min(rotationDuration / entityChargeDuration, 1) // 0 - 1 -> value between [0,1]

      rotationSpeed = lerp(INITIAL_ROTATION_SPEED, MAX_ROTATION_SPEED, rotationN)
      entity.currentSpell.charge = rotationN
      entity.updateChargeIndicator(entity, rotationSpeed, nebulaSystem)

      if (rotationSpeed > MIN_CHARGE_SPEED && !entity.currentSpell.canFire) {
        /* allow successful spell release */
        entity.currentSpell.canFire = true
        // console.log('entity.currentSpell.canFire: ', entity.currentSpell.canFire)
      }
      if (rotationSpeed >= MAX_ROTATION_SPEED) {
        /* spell overload -> forced release of the charged shot and receive damage */
        entity.currentSpell.canFire = false
        entity.currentSpell.forcedSpellRelease = true
        entity.currentSpell.charge = 0
        console.log('overload: ')
        state.removeEvent('renderer.update', chargingUuid)
        entity.destroyChargeIndicatorVFX(nebulaSystem, vfxRenderer, chargeIndicatorEventUuid, entity)
        fireRaycaster(rotationSpeed, entity, target)
      } else {
        const isEntityChargeCritical: boolean = entity.detectCriticalCharge(entity)

        if (isEntityChargeCritical) {
          state.removeEvent('renderer.update', chargingUuid)
          entity.destroyChargeIndicatorVFX(nebulaSystem, vfxRenderer, chargeIndicatorEventUuid, entity)
          entity.fireSpell(entity, target, rotationSpeed)
        }
      }
    })
  },
  fireSpell(entity: any, target: any, rotationSpeed: number) {
    const { fireRaycaster } = SpellFire()

    fireRaycaster(rotationSpeed, entity, target)
    entity.currentSpell.forcedSpellRelease = false
    entity.currentSpell.canFire = false
    entity.currentSpell.charge = 0
  },
  updateChargeIndicator(entity: any, rotationSpeed: number, nebulaSystem: any) {
    if ((!state.isThirdPerson && entity.name === 'player') || !entity || !nebulaSystem?.emitters?.length) return
    const meshWorldPosition = new Vector3()
    entity.mesh.updateMatrixWorld(true)
    entity.mesh.getWorldPosition(meshWorldPosition)

    // Create a vector representing 1 unit forward in the local space (Z direction)
    const localForward = new Vector3(0, 0, 1)
    const localRight = new Vector3(-1, 0, 0)

    // Transform the local forward vector to world space
    const worldForward = localForward.applyMatrix4(entity.mesh.matrixWorld).sub(meshWorldPosition).normalize()
    const worldRight = localRight.applyMatrix4(entity.mesh.matrixWorld).sub(meshWorldPosition).normalize()

    // Calculate the emitter's position: 1 unit in front of the mesh plus halfHeight upwards
    const emitterPosition = meshWorldPosition
      .clone()
      .add(worldForward.multiplyScalar(0.4))
      .add(worldRight.multiplyScalar(0.3))
      .add(new Vector3(0, entity.halfHeight + 0.2, 0))

    const emitter = nebulaSystem.emitters[0]
    emitter.position.copy(emitterPosition)

    /* interpolate colors to indicate power of spell */
    const colorBehaviour = emitter.behaviours[1]

    const chargeColor = new Color('#ffffff').lerpColors(
      MIN_CHARGE_START_COLOR,
      MIN_CHARGE_END_COLOR,
      remap(INITIAL_ROTATION_SPEED, MAX_ROTATION_SPEED, 0, 1.6, rotationSpeed) /*
       */
    )
    const endChargeColor = '#edc6bc'
    // console.log('chargeColor: #', chargeColor.getHexString())
    colorBehaviour.colorA.colors = [`#${chargeColor.getHexString()}`]
    colorBehaviour.colorB.colors = [endChargeColor]

    const scaleBehaviour = emitter.behaviours[2]
    /* scale up the spell with rotationSpeed */
    const scale = remap(INITIAL_ROTATION_SPEED, MAX_ROTATION_SPEED, 0.5, 2, rotationSpeed)
    const doubleScale = scale * 2
    scaleBehaviour.scaleA.a = scale
    scaleBehaviour.scaleA.b = scale
    scaleBehaviour.scaleB.a = doubleScale
    scaleBehaviour.scaleB.b = doubleScale
  },
  async createChargeIndicator(entity: any) {
    if ((!state.isThirdPerson && entity.name === 'player') || !entity?.center)
      return { eventUuid: '', nebulaSystem: null }
    const position = entity.center.clone()
    const { eventUuid, nebulaSystem, vfxRenderer } = await createVFX(position, 'charge', false)
    return { eventUuid, nebulaSystem, vfxRenderer }
  },
  destroyChargeIndicatorVFX(nebulaSystem: any, vfxRenderer: any, chargeIndicatorEventUuid: string, entity: any) {
    state.removeEvent('renderer.update', chargeIndicatorEventUuid)
    nebulaSystem?.destroy?.()
    nebulaSystem = null
    destroyRenderer(vfxRenderer)
    // entity?.name === 'player' && console.log('nebulaSystem destroyed: ', nebulaSystem, entity?.name)
  },
})

export const createOverHeadHealthBar = (entity: any) => {
  let healthBarEventUuid = ''
  const updateHealthBar = (entity: any) => {
    const healthBarContainer = document.querySelector(`.enemy-life-bar.entity-${entity.uuid}`) as HTMLDivElement

    if (!healthBarContainer || !entity.mesh) return
    const enemyPosition = entity.mesh.position.clone() // Placeholder for enemy position
    entity.mesh.getWorldPosition(enemyPosition)
    const entityScale = entity.mesh.scale.y * 100
    enemyPosition.y += entity.halfHeight * entityScale * 2 + 0.1 // Adjust height to be above the enemy

    // Convert 3D position to 2D screen space
    const screenPosition = enemyPosition.clone().project(state.camera)
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth
    const y = (1 - (screenPosition.y * 0.5 + 0.5)) * window.innerHeight

    // Calculate distance from camera
    const distance = state.camera.position.distanceTo(enemyPosition)
    let width = '100%'
    // Scale health bar size based on distance (closer = bigger, farther = smaller)
    let scaleFactor = Math.max(0.3, Math.min(1.0, 5 / distance)) // Clamps scale between 0.5 and 1.5
    if (entity.isDead(entity)) {
      scaleFactor = entityScale
      if (scaleFactor < 0.15) {
        scaleFactor = 0
        width = '0'
        healthBarContainer.style.maxWidth = `${width}px`
        healthBarContainer.style.width = `${width}px`
        healthBarContainer.style.minWidth = `${width}px`
        state.removeEvent('renderer.update', healthBarEventUuid)
      }
    }

    healthBarContainer.style.transform = `translate(-50%, -100%) scale(${scaleFactor})`
    healthBarContainer.style.left = `${x}px`
    healthBarContainer.style.top = `${y}px`

    if (screenPosition.z < 0 || screenPosition.z > 1) {
      healthBarContainer.style.opacity = '0'
    } else {
      healthBarContainer.style.opacity = '1'
    }
  }

  healthBarEventUuid = state.addEvent('renderer.update', () => updateHealthBar(entity))
}

const threatRaycaster = new Raycaster()
const DANGEROUS_CHARGE_LEVEL = 0.3
const AGENT_SAFE_CHARGE_LEVEL = 0.3
const AGENT_CRITICAL_CHARGE_LEVEL = 0.7
const RAYCAST_FRAME_INTERVAL = 500
let lastRaycastTime = Date.now()
const coverPointsWorker = new Worker(new URL('@/webworkers/coverPointsWorker.ts', import.meta.url), { type: 'module' })

function extractWorldGeometry() {
  const geo = state.level.children[0].geometry
  const vertices = new Float32Array(geo.attributes.position.array)
  const indices = new Uint32Array(geo.index.array)

  return {
    vertices,
    indices,
  }
}

export const controllerAwarenessUtils = () => ({
  detectCriticalCharge: (entity: any): boolean => {
    return entity.currentSpell.canFire && entity.currentSpell.charge > AGENT_CRITICAL_CHARGE_LEVEL
  },
  detectEnemyThreat: (entity: any, enemy: any) => {
    const isEnemyDangerous = enemy.currentSpell.charge > DANGEROUS_CHARGE_LEVEL
    const isEntityDangerous = entity.currentSpell.charge > AGENT_SAFE_CHARGE_LEVEL

    if (Date.now() - lastRaycastTime < RAYCAST_FRAME_INTERVAL)
      return { isEnemyAThreat: isEnemyDangerous && !isEntityDangerous, canSeeEnemy: false }

    // Set start position at entity's height
    const entityPosition = entity.mesh.position.clone()
    entityPosition.y += entity.halfHeight
    const enemyPosition = enemy.mesh.position.clone()
    enemyPosition.y += enemy.halfHeight
    const direction = new Vector3().subVectors(enemyPosition, entityPosition).normalize()

    // Set raycaster
    threatRaycaster.set(entityPosition, direction)
    lastRaycastTime = Date.now()
    const intersects = threatRaycaster.intersectObjects(state.scene.children, true)

    if (intersects.length > 0) {
      // intersects[0].object.name === 'ThunderFairyMesh' && console.log('Enemy sees me' /*, intersects[0].object*/)
      const hasLineOfSight = intersects[0].object === enemy.mesh
      return { isEnemyAThreat: isEnemyDangerous && !isEntityDangerous, canSeeEnemy: hasLineOfSight }
    }

    return { isEnemyAThreat: isEnemyDangerous && !isEntityDangerous, canSeeEnemy: false }
  },
  findCoverPosition: (entity: any, enemy: any): Promise<Vector3> => {
    return new Promise((resolve, reject) => {
      const { coverPositions } = state.level.pathfinder
      const world = extractWorldGeometry()

      // const bestCover = raycastDebug({ entity, enemy })
      // return resolve(bestCover as Vector3)

      coverPointsWorker.postMessage({
        coverPositions,
        enemyPosition: { x: enemy.mesh.position.x, y: enemy.mesh.position.y, z: enemy.mesh.position.z },
        enemyHalfHeight: enemy.halfHeight,
        entityPosition: { x: entity.mesh.position.x, y: entity.mesh.position.y, z: entity.mesh.position.z },
        entityHalfHeight: entity.halfHeight,
        world,
      })

      coverPointsWorker.onmessage = function (event: any) {
        const { bestCover } = event.data
        state.enableDebug && bestCover && console.log('bestCover: ', bestCover)
        if (bestCover) {
          // Add a green box at the cover position
          state.enableDebug && createDebugBox(bestCover)

          resolve(bestCover as Vector3)
        } else {
          reject(null)
        }
      }
    })
  },
})

const raycaster = new Raycaster()

function raycastDebug(data: any) {
  const { enemy, entity } = data
  const { coverPositions } = state.level.pathfinder

  const enemyPos = new Vector3().copy(enemy.mesh.position)
  enemyPos.setY(enemyPos.y + enemy.halfHeight)
  const entityPos = new Vector3().copy(entity.mesh.position)
  entityPos.setY(entityPos.y + entity.halfHeight)

  /* find the distance from entity to the coverPositions*/

  const coverPointsWithCoverPointsList = coverPositions
    .map((cover: any) => {
      const coverPos = new Vector3(cover.x, cover.y, cover.z)
      const distance = entityPos.distanceTo(coverPos)

      return { ...cover, distance }
    })
    .sort((a: any, b: any) => a.distance - b.distance)
  state.scene.updateMatrixWorld(true)

  /* start raycasting from the closests, if one is blocked -> a cover position is found */
  const bestCCover = coverPointsWithCoverPointsList.find((cover: any) => {
    const coverPos = new Vector3(cover.x, cover.y + 0.9, cover.z)

    const directionN = new Vector3().subVectors(coverPos, enemyPos).normalize()
    raycaster.set(enemyPos, directionN)
    // return
    const intersects = raycaster.intersectObjects(state.scene.children[5].children, true)

    if (intersects.length > 0) {
      const foundCover = intersects.find(intersect => intersect.object?.name === 'cover')
      if (intersects?.[0].object?.name !== 'cover' && foundCover) {
        console.log('foundCover: ', foundCover)
        foundCover.object.material.color.set(0xff0055)
        return cover
      }
      foundCover.object.material.color.set(0xf0df00)

      for (const intersect of intersects) {
        createRayTrace(intersect.point)
      }
    }
  })
  console.log('bestCCover: ', bestCCover)
  return bestCCover
}
