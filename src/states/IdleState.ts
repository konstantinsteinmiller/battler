import State, { isMovingEntity, transitionTo } from '@/states/State'

export default class IdleState extends State {
  constructor(parent: any) {
    super(parent)
  }

  get name() {
    return 'idle'
  }

  enter(previousState: any) {
    const idleAction = this.parent.animationsMap['idle'].action
    if (previousState) {
      const prevAction = this.parent.animationsMap[previousState.name].action
      idleAction.time = 0.0
      idleAction.enabled = true
      idleAction.setEffectiveTimeScale(1.0)
      idleAction.setEffectiveWeight(1.0)
      idleAction.crossFadeFrom(prevAction, 0.5, true)
      idleAction.play()
    } else {
      idleAction.play()
    }
  }
  exit() {}
  update(_: any, input: any) {
    // if (input.keysMap.leftMouse) {
    //   this.parent.setState('cast')
    //   return
    // }
    if (isMovingEntity(this.parent)) return

    // if (transitionTo('cast', this.parent)) return
    if (transitionTo('jump', this.parent)) return
    if (input.keysMap.forward) {
      this.parent.setState('walk')
    } else if (input.keysMap.backward) {
      this.parent.setState('walk-back')
    }
  }
}
