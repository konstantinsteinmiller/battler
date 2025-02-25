import AssetLoader from '@/engine/AssetLoader.ts'
import { characterAnimationNamesList } from '@/enums/constants.ts'
import CharacterFSM from '@/states/CharacterFSM.ts'
import state from '@/states/GlobalState.ts'
import { calcRapierMovementVector } from '@/utils/collision.ts'
import { chargeUtils, controllerAwarenessUtils, statsUtils, controllerUtils, createOverHeadHealthBar, getBaseStats } from '@/utils/controller.ts'
import { moveToTargetPosition } from '@/utils/navigation.ts'
import { createRigidBodyEntity } from '@/utils/physics.ts'
import { Object3D, Vector3 } from 'three'

export default ({ enemy, modelPath, name, startPosition, modelHeight }: { enemy: any; modelPath: string; name: string; startPosition: Vector3; modelHeight: number }) => {
  let mesh: any = new Object3D()
  mesh.position.copy(startPosition)
  const halfHeight = modelHeight * 0.5

  const entity = {
    ...new Object3D(),
    position: startPosition.clone(),
    ...getBaseStats(),
    ...controllerUtils(),
    ...statsUtils(),
    ...controllerAwarenessUtils(),
    ...chargeUtils(),
    createOverHeadHealthBar,
    moveToTargetPosition,
    mesh,
    halfHeight,
    name,
  }

  entity.currentSpell.speed = 6

  let mixer: any = {}
  const animationsMap: any = {}

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
        mesh.entityId = `${entity.uuid}`
        entity.mesh = mesh
      },
    })
  }
  const initPhysics = () => {
    const { rigidBody, collider } = createRigidBodyEntity(startPosition, halfHeight, entity.colliderRadius)
    entity.rigidBody = rigidBody
    entity.collider = collider
  }

  entity.createOverHeadHealthBar(entity)

  loadModels()
  initPhysics()

  const decceleration = new Vector3(-0.0005, -0.0001, -5.0)
  // const acceleration = new Vector3(1, 0.25, 15.0)
  const velocity = new Vector3(0, 0, 0)

  entity.isAwaitingCoverCalculation = false
  const update = (deltaS: number) => {
    if (!entity.mesh || entity.stateMachine.currentState === null) {
      return
    }

    if (state?.level?.pathfinder) {
      const targetPosition = null // use a random point in the map
      const { isEnemyAThreat, canSeeEnemy } = entity.detectEnemyThreat(entity, enemy)
      const isEntityChargeCritical: boolean = entity.detectCriticalCharge(entity)

      if (isEntityChargeCritical /*&& canSeeEnemy*/) {
      }
      // console.log('entity.currentSpell.charge: ', entity.currentSpell.charge)
      if (entity.currentSpell.charge === 0) {
        entity.chargeAttack(entity, enemy)
      }

      if (isEnemyAThreat && !entity.isAwaitingCoverCalculation) {
        entity.isAwaitingCoverCalculation = true
        entity.findCoverPosition(entity, enemy).then((coverPosition: Vector3) => {
          // coverPosition calculation returned from web worker
          if (isEntityChargeCritical) {
            isEntityChargeCritical && console.log('isEntityChargeCritical: ', isEntityChargeCritical)
            entity.path = null
            entity.moveToTargetPosition(entity, enemy.mesh.position, enemy, true)
            return
          }

          if (isEnemyAThreat) {
            console.log('goto coverPosition: ')
            entity.path = null
            entity.lastCoverPosition = coverPosition
            /* go directly to cover position */
            entity.moveToTargetPosition(entity, coverPosition, enemy, true)
          } else {
            entity.lastCoverPosition = null
            entity.isAwaitingCoverCalculation = false
          }
        })
      } else if (!entity.lastCoverPosition) {
        /* move around randomly */
        entity.moveToTargetPosition(entity, targetPosition, enemy)
      }
    }

    const frameDecceleration = new Vector3(velocity.x * decceleration.x, velocity.y * decceleration.y, velocity.z * decceleration.z)
    frameDecceleration.multiplyScalar(deltaS)
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(Math.abs(frameDecceleration.z), Math.abs(velocity.z))

    velocity.add(frameDecceleration)

    const movementVector = calcRapierMovementVector(entity, velocity, deltaS)
    entity.rigidBody.setNextKinematicTranslation(movementVector)

    /* correct mesh position in physics capsule */
    const meshPos = new Vector3(0, -entity.halfHeight, 0).add(entity.rigidBody.translation())
    // Update Three.js Mesh Position
    entity.position.copy(meshPos)
    mesh.position.copy(meshPos)

    mixer?.update?.(deltaS)
  }

  /* @Todo: remove the eventUuid when the enemy is destroyed */
  const eventUuid = state.addEvent('renderer.update', update)

  state.enemy = entity
  return entity
}
