import * as THREE from 'three'
import { Vector3 } from 'three'
import System, { GPURenderer } from 'three-nebula'
import state from '@/states/GlobalState'

import ShotVFX from '@/vfx/shot.json'
import DeathStarVFX from '@/vfx/death-star.json'
import ChargeVFX from '@/vfx/charge.json'
import { v4 } from 'uuid'

const vfxMap: { [key: string]: any } = {
  shot: ShotVFX,
  deathStar: DeathStarVFX,
  charge: ChargeVFX,
}

export const destroyRenderer = (renderer: GPURenderer) => {
  if (renderer) {
    renderer?.forceContextLoss?.()
    renderer.destroy()
    renderer?.dispose?.()

    state.vfxList = state.vfxList.filter((name: string) => name !== renderer.vfxName)
    // console.log(JSON.stringify(state.vfxList, undefined, 2))
  }
}

export const createVFX = async (
  position: Vector3,
  vfxName: string,
  removeOnDeath: boolean = true,
  onFinished?: () => void
): Promise<{ eventUuid: string; nebulaSystem: any; vfxRenderer: any }> => {
  const vfx = vfxMap[vfxName]
  if (!vfx) {
    console.error(`VFX not found: ${vfxName}`)
    return Promise.reject({ eventUuid: '', nebulaSystem: null })
  }

  const system = await System.fromJSONAsync(vfx.particleSystemState, THREE)
  // const nebulaRenderer = new SpriteRenderer(state.scene, THREE)
  const vfxRenderer = new GPURenderer(state.scene, THREE)
  vfxRenderer.vfxName = `${vfxName}_${v4()}`
  state.vfxList.push(vfxRenderer.vfxName)

  const nebulaSystem = system.addRenderer(vfxRenderer)
  nebulaSystem.emitters.forEach((emitter: any) => {
    emitter.position.copy(position as Vector3)
  })

  let hasRemovedSystem = false
  const eventUuid = state.addEvent(`renderer.update`, () => {
    nebulaSystem.update()
    /* if all emitters are dead remove the vfx */
    if (removeOnDeath && nebulaSystem.emitters.every((emitter: any) => emitter.dead)) {
      setTimeout(() => {
        if (hasRemovedSystem) return
        onFinished?.()
        state.removeEvent(`renderer.update`, eventUuid)
        nebulaSystem.destroy()
        destroyRenderer(vfxRenderer)
        hasRemovedSystem = true
      }, 1000)
    }
  })
  return Promise.resolve({ eventUuid, nebulaSystem, vfxRenderer })
}

export const createShotVFX = async (
  intersect: any,
  entity: any,
  directionN: Vector3,
  hitCallback: () => void = () => {}
) => {
  const adjustedPosition = entity.getPosition().clone()
  adjustedPosition.y += 1

  const system = await System.fromJSONAsync(ShotVFX.particleSystemState, THREE)
  // const nebulaRenderer = new SpriteRenderer(state.scene, THREE)
  const vfxRenderer = new GPURenderer(state.scene, THREE)
  const nebulaSystem = system.addRenderer(vfxRenderer)
  vfxRenderer.vfxName = `shot_${v4()}`
  state.vfxList.push(vfxRenderer.vfxName)

  const forceMagnitude = 10000
  const forceDirection = directionN.clone().negate().normalize().multiplyScalar(forceMagnitude)

  nebulaSystem.emitters.forEach((emitter: any) => {
    /* adjust the force field of the emitters to get proper rotation
     * of the left behind particle */
    const forceBehaviour = emitter.behaviours.find((behaviour: any) => behaviour.type === 'Force')
    if (forceBehaviour) {
      forceBehaviour.force.x = forceDirection.x
      forceBehaviour.force.y = forceDirection.y
      forceBehaviour.force.z = forceDirection.z
    }

    emitter.position.copy(adjustedPosition)
  })

  const SHOT_SPEED = 100
  let eventUuid: string = ''
  let hasAppliedCallbackOnce = false

  state.sounds.addAndPlayPositionalSound(entity, 'spellShot', { volume: 0.15 })

  let wasSpellRemoved: boolean = false

  eventUuid = state.addEvent(`renderer.update`, (deltaS: number) => {
    nebulaSystem.emitters.forEach((emitter: any) => {
      const isLevel = intersect.object?.entityType === 'level'
      let destinationPoint = new Vector3()

      if (isLevel) {
        destinationPoint.copy(intersect.point)
      } else {
        destinationPoint = intersect.object?.parent.position.clone()
        destinationPoint.y += entity.halfHeight || 0
      }
      const distToTarget = destinationPoint.distanceTo(emitter.position)

      // const distFromEntity = emitter.position.clone().distanceTo(entity.mesh.position.clone())
      // const forceBehaviour = emitter.behaviours.find((behaviour: any) => behaviour.type === 'Force')

      // if (forceBehaviour) {
      //   // console.log('distFromEntity: ', distFromEntity)
      //   if (distFromEntity < 6.8) {
      //     forceBehaviour.force.x = 0
      //     forceBehaviour.force.y = 0
      //     forceBehaviour.force.z = 0
      //   } else {
      //     forceBehaviour.force.x = forceDirection.x
      //     forceBehaviour.force.y = forceDirection.y
      //     forceBehaviour.force.z = forceDirection.z
      //   }
      // }

      if (distToTarget < 0.7) {
        if (!hasAppliedCallbackOnce) {
          hitCallback()
          hasAppliedCallbackOnce = true
        }

        /* remove force */
        const forceBehaviour = emitter.behaviours.find((behaviour: any) => behaviour.type === 'Force')
        if (forceBehaviour) {
          forceBehaviour.force.x = 0
          forceBehaviour.force.y = 0
          forceBehaviour.force.z = 0
        }

        /* let the impacted spell sit for a while to see where you hit */

        setTimeout(() => {
          if (wasSpellRemoved) return
          state.removeEvent('renderer.update', eventUuid)
          nebulaSystem.destroy()
          destroyRenderer(vfxRenderer)
          wasSpellRemoved = true
        }, 2000)
        return
      }

      const trajectoryVector: Vector3 = destinationPoint.clone().sub(emitter.position).normalize()
      const factor = distToTarget < 1 ? 0.4 : 1
      const movementDistance = deltaS * SHOT_SPEED * factor
      const movementVector: Vector3 = trajectoryVector.multiplyScalar(movementDistance)

      emitter.position.add(movementVector)
    })
    nebulaSystem.update()
  })
}
