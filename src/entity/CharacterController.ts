import AssetLoader from '@/engine/AssetLoader.ts'
import { characterAnimationNamesList } from '@/enums/constants.ts'
import { statsUtils, controllerUtils, getBaseStats } from '@/utils/controller.ts'
import { createRigidBodyEntity } from '@/utils/physics.ts'
import { Object3D, Quaternion, Vector3 } from 'three'
import * as THREE from 'three'
import InputController from '@/control/KeyboardController.ts'
import CharacterFSM from '@/states/CharacterFSM.ts'
import state from '@/states/GlobalState'
import { calcRapierMovementVector } from '@/utils/collision'

let entity: any = null

export default ({ modelPath, stats = {}, startPosition, modelHeight = 1.8 }: { modelPath: string; stats: any; startPosition: Vector3; modelHeight: number }) => {
  if (entity !== null) {
    return entity
  }

  let mesh: any = new Object3D()
  mesh.position.copy(startPosition)
  const halfHeight = modelHeight * 0.5

  entity = {
    ...new Object3D(),
    ...getBaseStats(),
    ...stats,
    ...controllerUtils(),
    ...statsUtils(),
    mesh: mesh,
    halfHeight,
  }
  // console.log('entity: ', entity)
  /* @Todo remove */
  entity.currentSpell.speed = undefined

  entity.getPosition = () => {
    if (!mesh) {
      return new Vector3(0, 0, 0)
    }
    return mesh?.position
  }
  entity.getRotation = () => {
    return mesh.quaternion
  }
  entity.setRotation = (rotation: THREE.Quaternion) => {
    if (!mesh) {
      return
    }
    const prevQuat = mesh.quaternion.clone()
    prevQuat.slerp(rotation, 0.2) // Smooth interpolation
    entity.rigidBody.setRotation(prevQuat)
    return mesh.quaternion.copy(prevQuat)
  }

  InputController()
  let mixer: any = {}
  const animationsMap: any = {}
  const decceleration = new Vector3(-0.0005, -0.0001, -5.0)
  const acceleration = new Vector3(1, 0.25, 15.0)
  const currentVelocity = new Vector3(0, 0, 0)

  const stateMachine = new CharacterFSM(animationsMap, entity)
  entity.stateMachine = stateMachine

  const loadModels = async () => {
    const { loadCharacterModelWithAnimations } = AssetLoader()
    await loadCharacterModelWithAnimations({
      modelPath,
      parent: state.scene,
      position: startPosition,
      scale: 0.01,
      stateMachine,
      animationsMap,
      animationNamesList: characterAnimationNamesList,
      callback: (scope: any) => {
        mixer = scope.mixer
        mesh = scope.mesh
        mesh.entityId = `${entity.uuid}::mesh`
        entity.mesh = mesh
      },
    })
  }
  loadModels()

  const initPhysics = () => {
    const { rigidBody, collider } = createRigidBodyEntity(startPosition, halfHeight, entity.colliderRadius)
    entity.rigidBody = rigidBody
    entity.collider = collider
  }
  initPhysics()

  const calcVelocityAndRotation = (velocity: Vector3, deltaS: number) => {
    const frameDecceleration = new Vector3(velocity.x * decceleration.x, velocity.y * decceleration.y, velocity.z * decceleration.z)
    frameDecceleration.multiplyScalar(deltaS)
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(Math.abs(frameDecceleration.z), Math.abs(velocity.z))

    velocity.add(frameDecceleration)

    const _Q = new Quaternion()
    const _A = new Vector3()
    const _R = mesh.quaternion.clone()

    const acc = acceleration.clone()
    if (state.controls.sprint) {
      acc.multiplyScalar(2.0)
    }

    const stopStates = ['cast', 'hit']
    if (stopStates.includes(stateMachine.currentState.name)) {
      acc.multiplyScalar(0.0)
    }

    if (stateMachine.currentState.name === 'jump' && !state.controls.sprint) {
      acc.multiplyScalar(1.5)
    }

    if (state.controls.forward) {
      velocity.z += acc.z * deltaS
    }
    if (state.controls.backward) {
      velocity.z -= acc.z * deltaS
    }
    if (state.controls.left) {
      _A.set(0, 1, 0)
      _Q.setFromAxisAngle(_A, 4.0 * Math.PI * deltaS * acceleration.y)
      _R.multiply(_Q)
    }
    if (state.controls.right) {
      _A.set(0, 1, 0)
      _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * deltaS * acceleration.y)
      _R.multiply(_Q)
    }
    return { _R, velocity }
  }

  const update = (deltaS: number, elapsedTimeInS: number) => {
    if (!mesh || stateMachine.currentState === null) {
      return
    }
    stateMachine.update(deltaS, state.controls)

    entity.updateEndurance(entity, deltaS, elapsedTimeInS)

    const { _R, velocity } = calcVelocityAndRotation(currentVelocity, deltaS)

    entity.mesh.quaternion.slerp(_R, 0.1) // Smooth interpolation

    const movementVector = calcRapierMovementVector(entity, velocity, deltaS)

    /* apply rotation and translation to physical body */
    entity.rigidBody.setNextKinematicRotation(entity.getRotation())
    entity.rigidBody.setNextKinematicTranslation(movementVector)

    /* correct mesh position in physics capsule */
    const meshPos = new Vector3(0, -entity.halfHeight, 0).add(entity.rigidBody.translation())
    /* Update Three.js Mesh Position */
    entity.position.copy(meshPos)
    mesh.position.copy(meshPos)

    mixer?.update?.(deltaS)

    entity.updateLife(entity, elapsedTimeInS)
  }

  state.addEvent('renderer.update', update)

  state.player = entity
  return entity
}
