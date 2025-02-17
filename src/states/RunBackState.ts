import State, { isMovingEntity, transitionTo } from '@/states/State'
import state from '@/states/GlobalState.ts'
import { transition } from 'three/examples/jsm/tsl/display/TransitionNode'

export default class RunBackState extends State {
  constructor(parent: any) {
    super(parent)
  }

  get name() {
    return 'run-back'
  }

  enter(previousState: any) {
    const currentAction = this.parent.animationsMap['run-back'].action
    if (previousState) {
      const previousAction = this.parent.animationsMap[previousState.name].action

      currentAction.enabled = true

      const states = ['walk-back', 'walk', 'run']
      if (states.includes(previousState.name)) {
        const ratio = currentAction.getClip().duration / previousAction.getClip().duration
        currentAction.time = previousAction.time * ratio
      } else {
        currentAction.time = 0.0
        currentAction.setEffectiveTimeScale(1.0)
        currentAction.setEffectiveWeight(1.0)
      }

      // if (previousState.name == 'jump') {
      //   currentAction.crossFadeFrom(previousAction, 0.01, true)
      //   currentAction.play()
      //   return
      // }
      currentAction.crossFadeFrom(previousAction, 0.5, true)
      currentAction.play()
    } else {
      currentAction.play()
    }
  }

  exit() {}

  update(timeElapsed: number, input: any) {
    if (isMovingEntity(this.parent)) return

    // if (transitionTo('cast', this.parent)) return
    if (transitionTo('jump', this.parent)) return
    if (transitionTo('walk-back', this.parent)) return
    if (transitionTo('run', this.parent)) return

    this.parent.setState('idle')
  }
}
