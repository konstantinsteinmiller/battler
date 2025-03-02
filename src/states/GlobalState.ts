import { LoadingManager } from 'three'
import { v4 as uuidv4 } from 'uuid'

const loadingManager = new LoadingManager()
let state: {
  triggerEvent: (eventName: string) => void
  addEvent: (
    eventName: string,
    callback: (a?: any, b?: any) => any,
    cleanup?: () => any | undefined,
    sourceName?: string
  ) => string
  removeEvent: (eventName: string, uuid: string) => void
  [key: string]: any /* global objects */
  eventsMap: {
    [key: string]: {
      uuid: string
      callback: () => any
      cleanup?: any
      sourceName?: string
    }[]
  }
  oneTimeEventsList: {
    eventName: string
    uuid: string
    callback: () => any
    cleanup?: any
  }[]
  level: {
    name: string
    zone: string
    pathfinder: any
    movingEntitiesList: string[]
  }
  player: any
  enemy: any
  loadingManager: any
} = null

const globalState = () => {
  /* state is a Singleton */
  if (state !== null) {
    return state
  }

  /* needed for e.g. triggerEvent... */
  state = {
    eventsMap: {},
  }
  state = {
    triggerEvent: (eventName: string) => {
      state.eventsMap[eventName]?.forEach((event: any) => {
        if (!event) {
          console.warn('Event not found')
          return
        }
        event.callback?.()
        // console.log('XXEvent triggered:', eventName)
      })
    },
    addOneTimeEvent: (eventName: string, callback: () => string) => {
      const uuid = uuidv4()
      state.oneTimeEventsList?.push({
        eventName,
        uuid,
        cleanup: () => {
          state.oneTimeEventsList = state.oneTimeEventsList.filter((e: any) => e.uuid !== uuid)
        },
        callback,
      })
    },
    addEvent: (eventName: string, callback: () => string, cleanup?: () => any, sourceName?: string): string => {
      const uuid = uuidv4()
      if (!state?.eventsMap?.[eventName]) {
        state.eventsMap[eventName] = []
      }
      state?.eventsMap[eventName]?.push({
        uuid,
        callback,
        cleanup,
        sourceName,
      })
      // console.log('XXEvent added:', eventName, 'with ', uuid)
      return uuid
    },
    removeEvent: (eventName: string, uuid: string) => {
      const event = state.eventsMap[eventName]
      event.cleanup?.()
      state.eventsMap[eventName] = state.eventsMap[eventName].filter((e: any) => e.uuid !== uuid)
      // console.log('XXEvent removed:', eventName, 'with ', uuid)
    },
    eventsMap: {},
    oneTimeEventsList: [],
    player: {},
    enemy: {},
    loadingManager: loadingManager,
  }
  // console.log('XXstate: ', state)

  /* init this game state with defaults */
  state.enableWater = true
  state.enableDebug = false
  // state.debugPhysics = true
  // state.showCursor = false
  state.showCursor = true
  state.showCrosshair = true
  state.isThirdPerson = true
  state.isPaused = false
  state.isPointerLocked = false
  state.isBattleOngoing = false
  state.isEngineInitialized = false
  state.isBattleInitialized = false
  state.vfxList = []

  return state
}
const currentState = globalState()
export default currentState
