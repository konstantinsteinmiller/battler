import * as THREE from 'three'
import { Vector3 } from 'three'
import System, { SpriteRenderer, GPURenderer, Force } from 'three-nebula'
import state from '@/states/GlobalState'

// import TwinShot from '@/vfx/twin-shot_2.json'
import ShotVFX from '@/vfx/shot.json'

export const createShotVFX = async (intersect: any, entity: any, directionN: Vector3, hitCallback: () => void = () => {}) => {
  const adjustedPosition = entity.getPosition().clone()
  adjustedPosition.y += 1

  const system = await System.fromJSONAsync(ShotVFX.particleSystemState, THREE)
  // const nebulaRenderer = new SpriteRenderer(state.scene, THREE)
  const nebulaRenderer = new GPURenderer(state.scene, THREE)
  const nebulaSystem = system.addRenderer(nebulaRenderer)

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
        hitCallback()

        /* remove force */
        const forceBehaviour = emitter.behaviours.find((behaviour: any) => behaviour.type === 'Force')
        if (forceBehaviour) {
          forceBehaviour.force.x = 0
          forceBehaviour.force.y = 0
          forceBehaviour.force.z = 0
        }

        /* let the impacted spell sit for a while to see where you hit */
        setTimeout(() => {
          state.removeEvent(`renderer.update`, eventUuid)
          nebulaSystem.destroy()
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
