import { AnimationMixer, Object3D } from 'three'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

let loader: any = null

export default () => {
  if (loader !== null) {
    return loader
  }

  loader = {}

  loader.loadMesh = async (
    publicPath: string,
    parent: Object3D,
    scale: number = 0.1,
    shadows: boolean = true,
    callback?: (scene: Object3D) => void /*
     */
  ) => {
    if (publicPath.endsWith('.fbx')) {
      return loader.loadFBXMesh(publicPath, parent, scale, shadows, callback)
    }
    return loader.loadGLBMesh(publicPath, parent, scale, shadows, callback)
  }

  loader.loadGLBMesh = async (
    publicPath: string,
    parent: Object3D,
    scale: number,
    shadows: boolean = true,
    callback?: (scene: Object3D) => void /*
     */
  ) => {
    const loaderGlb = new GLTFLoader()
    const glb = await loaderGlb.loadAsync(publicPath)
    console.log('glb: ', glb)
    if (shadows) {
      glb.scene.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          console.log('child: ', child)
          child.scale.setScalar(scale)
          child.castShadow = true
          child.receiveShadow = true
          parent.add(child)
        }
      })
    }
    callback?.(glb.scene)
    return glb.scene
  }

  loader.loadFBXMesh = async (
    publicPath: string,
    parent: Object3D,
    scale: number,
    shadows: boolean = true,
    callback?: (scene: Object3D) => void /*
     */
  ) => {
    const loaderFbx = new FBXLoader()
    const fbx: any = await loaderFbx.loadAsync(publicPath)

    if (shadows) {
      fbx.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          // console.log('child: ', child)
          if (scale >= 0) child.scale.setScalar(scale)
          child.castShadow = true
          child.receiveShadow = true
          parent.add(child)
        }
      })

      callback?.(fbx)
      return fbx
    }
  }

  loader.loadCharacterModelWithAnimations = async ({
    modelPath,
    parent,
    scale,
    animationNamesList,
    stateMachine,
    animationsMap,
    shadows = true,
    callback,
  }: {
    modelPath: string
    parent: Object3D
    scale: number
    animationNamesList: string[]
    stateMachine: any
    animationsMap: any
    shadows?: boolean
    callback?: (scene: Object3D) => void /*
     */
  }) => {
    const loader = new FBXLoader()
    const pathPartsList = modelPath.split('/')
    pathPartsList.pop()
    const animationsPath = `${pathPartsList.join('/')}/`

    loader.load(modelPath, (model: any) => {
      model.scale.setScalar(scale)
      if (shadows) {
        model.traverse((c: any) => {
          c.castShadow = true
        })
      }
      const mesh = model
      parent.add(mesh)

      const mixer: AnimationMixer = new AnimationMixer(mesh)

      /* as soon as all animations where loaded, set stateMachine to idle state */
      const loadingManager = new THREE.LoadingManager()
      loadingManager.onLoad = () => {
        if (callback) {
          const scope: any = {
            mixer,
            mesh,
            animationsMap,
          }
          callback?.(scope)
        }
        stateMachine.setState('idle')
      }

      /* When the animation was loaded, add to animationsMap */
      const onLoad = (animName: string, anim: any) => {
        const clip = anim.animations[0]
        const action = mixer.clipAction(clip)

        animationsMap[animName] = {
          clip: clip,
          action: action,
        }
      }

      /* load all animations from same folder as the models
       * path and add to animationsMap */
      const animLoader = new FBXLoader(loadingManager)
      animLoader.setPath(animationsPath)
      animationNamesList.forEach((name: string) =>
        animLoader.load(
          `${name}.fbx`,
          (anim: any) => onLoad(name, anim) /*
           */
        )
      )
    })
  }

  return loader
}
