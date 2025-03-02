import { ColliderDesc, RigidBodyDesc } from '@dimforge/rapier3d-compat'
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import * as THREE from 'three'
import state from '@/states/GlobalState'
import { inverseLerp, lerp } from 'three/src/math/MathUtils.js'

const createColliderGeo = (geo: any, rigidBody: any, physic: any) => {
  const vertices = new Float32Array(geo.attributes.position.array)
  const indices: any = new Float32Array(geo.index.array)
  const colliderDesc = ColliderDesc.trimesh(vertices, indices)
  return physic.createCollider(colliderDesc, rigidBody)
}

const createColliderBall = (radius: number, rigidBody: any, physic: any) => {
  const colliderDesc = ColliderDesc.ball(radius)
  return physic.createCollider(colliderDesc, rigidBody)
}

export const createRigidBodyFixed = (mesh: any, physic: any) => {
  const rigidBodyDesc = RigidBodyDesc.fixed()
  const rigidBody = physic.createRigidBody(rigidBodyDesc)
  /*const collider: any = */ createColliderGeo(mesh.geometry, rigidBody, physic)
}

export const createRigidBodyEntity = (position: Vector3, physic: any) => {
  const rigidBodyDesc = RigidBodyDesc.dynamic()
  rigidBodyDesc.setTranslation(position.x, position.y, position.z)
  const rigidBody = physic.createRigidBody(rigidBodyDesc)
  const collider = createColliderBall(0.25, rigidBody, physic)
  return {
    rigidBody,
    collider,
  }
}

export function floor(float: number, max = 0.2) {
  return Math.abs(float) < max ? 0 : float
}

export function browse(object: any, callback: any) {
  if (object.isMesh) callback(object)
  const children = object.children
  // children.forEach(child => browse(child, callback))
  for (let i = 0; i < children.length; i++) {
    browse(children[i], callback)
  }
}

export function angle(x: number, z: number) {
  return Math.atan2(-z, x) + Math.PI / 2
}

// export const lerp = (x, y, a) => x * (1 - a) + y * a
// const invlerp = (x, y, a) => clamp((a - x) / (y - x));
// export const range = (x1, y1, x2, y2, a) => lerp(x2, y2, invlerp(x1, y1, a))
export const range = (angle1: number, angle2: number) => {
  let angle = ((angle1 - angle2 + Math.PI) % (Math.PI * 2)) - Math.PI
  angle = angle < -Math.PI ? angle + Math.PI * 2 : angle
  return angle
}

const reg = /\[(.*?)\]/
export const getSrc = (src: string) => {
  const match = src.match(reg)
  if (match !== null) {
    const range = match[1].split('-')
    const iBegin = parseInt(range[0], 10)
    const iEnd = parseInt(range[1], 10)
    const size = iEnd - iBegin + 1
    const source = src.split('[')[0]
    const ext = src.split(']')[1]
    return new Array(size).fill(null).map((e: any, i: number) => source + (i + iBegin) + ext)
  }
  return [src]
}

export const randomInt = (range = 1) => {
  return Math.floor(Math.random() * range + 0.5)
}

export const clamp = (x: number, a: number, b: number) => {
  return Math.min(Math.max(x, a), b)
}

export const createRayTrace = (target: THREE.Vector3) => {
  if (state.enableDebug) {
    // Draw a line from pointA in the given direction at distance 1
    const geometry = new THREE.SphereGeometry(0.1, 16, 16)
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const sphereMesh = new THREE.Mesh(geometry, material)
    sphereMesh.name = 'rayTrace'
    sphereMesh.position.copy(target)
    sphereMesh.scale.set(1, 1, 1)
    sphereMesh.frustumCulled = false
    sphereMesh.castShadow = true
    state.scene.add(sphereMesh)
    setTimeout(() => {
      state.scene.remove(sphereMesh)
      geometry.dispose()
      material.dispose()
    }, 10000)
  }
}

export const createDebugBox = (target: THREE.Vector3) => {
  const coverBoxGeometry = new BoxGeometry(0.4, 0.4, 0.4)
  const coverBoxMaterial = new MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 1 })
  const coverBox = new Mesh(coverBoxGeometry, coverBoxMaterial)
  coverBox.position.copy(target || new Vector3(0, 0, 0))
  state.scene.add(coverBox)

  // Fade out and remove after 5 seconds
  setTimeout(() => {
    const fadeOut = setInterval(() => {
      coverBoxMaterial.opacity -= 0.02
      if (coverBoxMaterial.opacity <= 0) {
        clearInterval(fadeOut)
        state.scene.remove(coverBox)
        coverBoxGeometry.dispose()
        coverBoxMaterial.dispose()
      }
    }, 100)
  }, 5000)
}

export const remap = (A: number, B: number, C: number, D: number, P: number) => {
  return lerp(C, D, inverseLerp(A, B, P))
}

/**
 * Converts a size in bytes to a human-readable string in megabytes (MB).
 *
 * @param bytes - The size in bytes to convert.
 * @param decimals - The number of decimal places to include in the result. Defaults to 2.
 * @returns A string representing the size in megabytes.
 */
export function formatBytesToMB(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 MB'
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes.toFixed(decimals)} MB`
}
export function formatBytesToGB(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 GB'
  const megabytes = bytes / (1024 * 1024 * 1024)
  return `${megabytes.toFixed(decimals)} GB`
}
export function convertToReadableSize(bytes: number, decimals: number = 2): string {
  return bytes > 1048576 * 100 ? formatBytesToGB(bytes, decimals) : formatBytesToMB(bytes, decimals)
}

export const isProduction = import.meta.env.VITE_NODE_ENV === 'production'
export const prependBaseUrl = (url: string): string => (isProduction ? `/zora${url}` : url)
export const repeat = (n: number, callback: (_: any, i: number) => string): string[] => [...new Array(n)].map(callback)

/*const onceMap: { [key: string]: boolean } = {}
export const once = (callback: () => void) => {
  const uuid = JSON.stringify(callback)
  let didOnce = onceMap[uuid]
  console.log('didOnce: ', didOnce, uuid)
  if (!didOnce) {
    callback()
    didOnce = true
  }
}*/
