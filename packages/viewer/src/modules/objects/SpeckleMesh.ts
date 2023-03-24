import Logger from 'js-logger'
import {
  BackSide,
  Box3,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  FloatType,
  Material,
  Matrix4,
  Mesh,
  Ray,
  Raycaster,
  RGBAFormat,
  Sphere,
  Triangle,
  Vector2,
  Vector3
} from 'three'
import { TransformStorage } from '../batching/Batcher'
import { BatchObject } from '../batching/BatchObject'
import { SpeckleBatchBVH } from './SpeckleBatchBVH'

const _inverseMatrix = new Matrix4()
const _ray = new Ray()
const _sphere = new Sphere()
const _vTemp = new Vector3()
const _vA = new Vector3()
const _vB = new Vector3()
const _vC = new Vector3()

const _tempA = new Vector3()
const _tempB = new Vector3()
const _tempC = new Vector3()

const _morphA = new Vector3()
const _morphB = new Vector3()
const _morphC = new Vector3()

const _uvA = new Vector2()
const _uvB = new Vector2()
const _uvC = new Vector2()

const _intersectionPoint = new Vector3()
const _intersectionPointWorld = new Vector3()

const ray = /* @__PURE__ */ new Ray()
const tmpInverseMatrix = /* @__PURE__ */ new Matrix4()

export default class SpeckleMesh extends Mesh {
  public static MeshBatchNumber = 0

  private batchNumber = -1
  private bvh: SpeckleBatchBVH = null
  private batchMaterial: Material = null

  private _batchObjects: BatchObject[]
  private transformsBuffer: Float32Array = null
  private transformStorage: TransformStorage
  public transformsDirty = true

  public transformsTextureUniform: DataTexture = null
  public transformsArrayUniforms: Matrix4[] = null

  public get BVH() {
    return this.bvh
  }

  public get batchObjects(): BatchObject[] {
    return this._batchObjects
  }

  constructor(geometry: BufferGeometry, material: Material) {
    super(geometry, material)
    this.batchMaterial = material
    this.batchNumber = SpeckleMesh.MeshBatchNumber++
  }

  public setBatchObjects(
    batchObjects: BatchObject[],
    transformStorage: TransformStorage
  ) {
    this._batchObjects = batchObjects
    this.transformStorage = transformStorage

    if (this.transformStorage === TransformStorage.VERTEX_TEXTURE) {
      this.transformsBuffer = new Float32Array(this._batchObjects.length * 3 * 4)
      this.transformsTextureUniform = new DataTexture(
        this.transformsBuffer,
        this.transformsBuffer.length / 4,
        1,
        RGBAFormat,
        FloatType
      )
    } else if (this.transformStorage === TransformStorage.UNIFORM_ARRAY) {
      this.transformsArrayUniforms = this._batchObjects.map((value) => value.transform)
    }
    this.updateTransformsUniform()
  }

  public updateMaterialTransformsUniform(material: Material) {
    material.defines['BATCH_NUMBER'] = this.batchNumber
    material.defines['TRANSFORM_STORAGE'] = this.transformStorage
    if (
      !material.defines['OBJ_COUNT'] ||
      material.defines['OBJ_COUNT'] !== this._batchObjects.length
    ) {
      material.defines['OBJ_COUNT'] = this._batchObjects.length
    }
    if (this.transformStorage === TransformStorage.VERTEX_TEXTURE)
      material.userData.tTransforms.value = this.transformsTextureUniform
    else if (this.transformStorage === TransformStorage.UNIFORM_ARRAY)
      material.userData.uTransforms.value = this.transformsArrayUniforms

    material.needsUpdate = true
  }

  public updateTransformsUniform() {
    if (!this.transformsDirty) return
    if (this.transformStorage === TransformStorage.VERTEX_TEXTURE) {
      this._batchObjects.forEach((batchObject: BatchObject) => {
        const index = batchObject.batchIndex * 12
        this.transformsBuffer[index] = batchObject.transform.elements[0]
        this.transformsBuffer[index + 1] = batchObject.transform.elements[4]
        this.transformsBuffer[index + 2] = batchObject.transform.elements[8]
        this.transformsBuffer[index + 3] = batchObject.transform.elements[12]

        this.transformsBuffer[index + 4] = batchObject.transform.elements[1]
        this.transformsBuffer[index + 5] = batchObject.transform.elements[5]
        this.transformsBuffer[index + 6] = batchObject.transform.elements[9]
        this.transformsBuffer[index + 7] = batchObject.transform.elements[13]

        this.transformsBuffer[index + 8] = batchObject.transform.elements[3]
        this.transformsBuffer[index + 9] = batchObject.transform.elements[6]
        this.transformsBuffer[index + 10] = batchObject.transform.elements[10]
        this.transformsBuffer[index + 11] = batchObject.transform.elements[14]
      })
      this.transformsTextureUniform.needsUpdate = true
    } else {
      this.transformsArrayUniforms = this._batchObjects.map((value) => value.transform)
    }
    if (this.bvh) {
      this.bvh.getBoundingBox(this.bvh.bounds)
      this.geometry.boundingBox.copy(this.bvh.bounds)
      this.geometry.boundingBox.getBoundingSphere(this.geometry.boundingSphere)
    }
    this.transformsDirty = false
  }

  public buildBVH(bounds: Box3) {
    this.bvh = new SpeckleBatchBVH(this.batchObjects, bounds)
  }

  public getBatchObjectMaterial(batchObject: BatchObject) {
    const rv = batchObject.renderView
    const group = this.geometry.groups.find((value) => {
      return (
        rv.batchStart >= value.start &&
        rv.batchStart + rv.batchCount <= value.count + value.start
      )
    })
    if (!Array.isArray(this.material)) {
      return this.material
    } else {
      if (!group) {
        Logger.warn(
          `Could not get material for ${batchObject.renderView.renderData.id}`
        )
        return null
      }
      return this.material[group.materialIndex]
    }
  }

  // converts the given BVH raycast intersection to align with the three.js raycast
  // structure (include object, world space distance and point).
  private convertRaycastIntersect(hit, object, raycaster) {
    if (hit === null) {
      return null
    }

    hit.point.applyMatrix4(object.matrixWorld)
    hit.distance = hit.point.distanceTo(raycaster.ray.origin)
    hit.object = object

    if (hit.distance < raycaster.near || hit.distance > raycaster.far) {
      return null
    } else {
      return hit
    }
  }

  raycast(raycaster: Raycaster, intersects) {
    if (this.bvh) {
      if (this.batchMaterial === undefined) return

      tmpInverseMatrix.copy(this.matrixWorld).invert()
      ray.copy(raycaster.ray).applyMatrix4(tmpInverseMatrix)

      const bvh = this.bvh
      if (raycaster.firstHitOnly === true) {
        const hit = this.convertRaycastIntersect(
          bvh.raycastFirst(ray, this.batchMaterial),
          this,
          raycaster
        )
        if (hit) {
          intersects.push(hit)
        }
      } else {
        const hits = bvh.raycast(ray, this.batchMaterial)
        for (let i = 0, l = hits.length; i < l; i++) {
          const hit = this.convertRaycastIntersect(hits[i], this, raycaster)
          if (hit) {
            intersects.push(hit)
          }
        }
      }
    } else {
      const geometry = this.geometry
      const material = this.material
      const matrixWorld = this.matrixWorld

      if (material === undefined) return

      // Checking boundingSphere distance to ray

      if (geometry.boundingSphere === null) geometry.computeBoundingSphere()

      _sphere.copy(geometry.boundingSphere)
      _sphere.applyMatrix4(matrixWorld)

      if (raycaster.ray.intersectsSphere(_sphere) === false) return

      //

      _inverseMatrix.copy(matrixWorld).invert()
      _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix)

      // Check boundingBox before continuing

      if (geometry.boundingBox !== null) {
        if (_ray.intersectsBox(geometry.boundingBox) === false) return
      }

      let intersection

      const index = geometry.index
      /** Stored high component if RTE is being used. Regular positions otherwise */
      const position = geometry.attributes.position
      /** Stored low component if RTE is being used. undefined otherwise */
      const positionLow = geometry.attributes['position_low']
      const morphPosition = geometry.morphAttributes.position
      const morphTargetsRelative = geometry.morphTargetsRelative
      const uv = geometry.attributes.uv
      const uv2 = geometry.attributes.uv2
      const groups = geometry.groups
      const drawRange = geometry.drawRange

      if (index !== null) {
        // indexed buffer geometry

        if (Array.isArray(material)) {
          for (let i = 0, il = groups.length; i < il; i++) {
            const group = groups[i]
            const groupMaterial = material[group.materialIndex]

            const start = Math.max(group.start, drawRange.start)
            const end = Math.min(
              index.count,
              Math.min(group.start + group.count, drawRange.start + drawRange.count)
            )

            for (let j = start, jl = end; j < jl; j += 3) {
              const a = index.getX(j)
              const b = index.getX(j + 1)
              const c = index.getX(j + 2)

              intersection = checkBufferGeometryIntersection(
                this,
                groupMaterial,
                raycaster,
                _ray,
                positionLow,
                position,
                morphPosition,
                morphTargetsRelative,
                uv,
                uv2,
                a,
                b,
                c
              )

              if (intersection) {
                intersection.faceIndex = Math.floor(j / 3) // triangle number in indexed buffer semantics
                intersection.face.materialIndex = group.materialIndex
                intersects.push(intersection)
              }
            }
          }
        } else {
          const start = Math.max(0, drawRange.start)
          const end = Math.min(index.count, drawRange.start + drawRange.count)

          for (let i = start, il = end; i < il; i += 3) {
            const a = index.getX(i)
            const b = index.getX(i + 1)
            const c = index.getX(i + 2)

            intersection = checkBufferGeometryIntersection(
              this,
              material,
              raycaster,
              _ray,
              positionLow,
              position,
              morphPosition,
              morphTargetsRelative,
              uv,
              uv2,
              a,
              b,
              c
            )

            if (intersection) {
              intersection.faceIndex = Math.floor(i / 3) // triangle number in indexed buffer semantics
              intersects.push(intersection)
            }
          }
        }
      } else if (position !== undefined) {
        // non-indexed buffer geometry

        if (Array.isArray(material)) {
          for (let i = 0, il = groups.length; i < il; i++) {
            const group = groups[i]
            const groupMaterial = material[group.materialIndex]

            const start = Math.max(group.start, drawRange.start)
            const end = Math.min(
              position.count,
              Math.min(group.start + group.count, drawRange.start + drawRange.count)
            )

            for (let j = start, jl = end; j < jl; j += 3) {
              const a = j
              const b = j + 1
              const c = j + 2

              intersection = checkBufferGeometryIntersection(
                this,
                groupMaterial,
                raycaster,
                _ray,
                positionLow,
                position,
                morphPosition,
                morphTargetsRelative,
                uv,
                uv2,
                a,
                b,
                c
              )

              if (intersection) {
                intersection.faceIndex = Math.floor(j / 3) // triangle number in non-indexed buffer semantics
                intersection.face.materialIndex = group.materialIndex
                intersects.push(intersection)
              }
            }
          }
        } else {
          const start = Math.max(0, drawRange.start)
          const end = Math.min(position.count, drawRange.start + drawRange.count)

          for (let i = start, il = end; i < il; i += 3) {
            const a = i
            const b = i + 1
            const c = i + 2

            intersection = checkBufferGeometryIntersection(
              this,
              material,
              raycaster,
              _ray,
              positionLow,
              position,
              morphPosition,
              morphTargetsRelative,
              uv,
              uv2,
              a,
              b,
              c
            )

            if (intersection) {
              intersection.faceIndex = Math.floor(i / 3) // triangle number in non-indexed buffer semantics
              intersects.push(intersection)
            }
          }
        }
      }
    }
  }
}

function checkIntersection(object, material, raycaster, ray, pA, pB, pC, point) {
  let intersect

  if (material.side === BackSide) {
    intersect = ray.intersectTriangle(pC, pB, pA, true, point)
  } else {
    intersect = ray.intersectTriangle(pA, pB, pC, material.side !== DoubleSide, point)
  }

  if (intersect === null) return null

  _intersectionPointWorld.copy(point)
  _intersectionPointWorld.applyMatrix4(object.matrixWorld)

  const distance = raycaster.ray.origin.distanceTo(_intersectionPointWorld)

  if (distance < raycaster.near || distance > raycaster.far) return null

  return {
    distance,
    point: _intersectionPointWorld.clone(),
    object,
    uv: undefined,
    uv2: undefined,
    face: undefined
  }
}

/** If the geometry is non double->2floats encoded, the `positionHigh` argument will actually
 *  hold the default `position` attribute values
 */
function checkBufferGeometryIntersection(
  object,
  material,
  raycaster,
  ray,
  positionLow,
  positionHigh,
  morphPosition,
  morphTargetsRelative,
  uv,
  uv2,
  a,
  b,
  c
) {
  _vA.fromBufferAttribute(positionHigh, a)
  _vB.fromBufferAttribute(positionHigh, b)
  _vC.fromBufferAttribute(positionHigh, c)
  if (positionLow) {
    _vA.add(_vTemp.fromBufferAttribute(positionLow, a))
    _vB.add(_vTemp.fromBufferAttribute(positionLow, b))
    _vC.add(_vTemp.fromBufferAttribute(positionLow, c))
  }

  const morphInfluences = object.morphTargetInfluences

  if (morphPosition && morphInfluences) {
    _morphA.set(0, 0, 0)
    _morphB.set(0, 0, 0)
    _morphC.set(0, 0, 0)

    for (let i = 0, il = morphPosition.length; i < il; i++) {
      const influence = morphInfluences[i]
      const morphAttribute = morphPosition[i]

      if (influence === 0) continue

      _tempA.fromBufferAttribute(morphAttribute, a)
      _tempB.fromBufferAttribute(morphAttribute, b)
      _tempC.fromBufferAttribute(morphAttribute, c)

      if (morphTargetsRelative) {
        _morphA.addScaledVector(_tempA, influence)
        _morphB.addScaledVector(_tempB, influence)
        _morphC.addScaledVector(_tempC, influence)
      } else {
        _morphA.addScaledVector(_tempA.sub(_vA), influence)
        _morphB.addScaledVector(_tempB.sub(_vB), influence)
        _morphC.addScaledVector(_tempC.sub(_vC), influence)
      }
    }

    _vA.add(_morphA)
    _vB.add(_morphB)
    _vC.add(_morphC)
  }

  if (object.isSkinnedMesh) {
    object.boneTransform(a, _vA)
    object.boneTransform(b, _vB)
    object.boneTransform(c, _vC)
  }

  const intersection = checkIntersection(
    object,
    material,
    raycaster,
    ray,
    _vA,
    _vB,
    _vC,
    _intersectionPoint
  )

  if (intersection) {
    if (uv) {
      _uvA.fromBufferAttribute(uv, a)
      _uvB.fromBufferAttribute(uv, b)
      _uvC.fromBufferAttribute(uv, c)

      intersection.uv = Triangle.getUV(
        _intersectionPoint,
        _vA,
        _vB,
        _vC,
        _uvA,
        _uvB,
        _uvC,
        new Vector2()
      )
    }

    if (uv2) {
      _uvA.fromBufferAttribute(uv2, a)
      _uvB.fromBufferAttribute(uv2, b)
      _uvC.fromBufferAttribute(uv2, c)

      intersection.uv2 = Triangle.getUV(
        _intersectionPoint,
        _vA,
        _vB,
        _vC,
        _uvA,
        _uvB,
        _uvC,
        new Vector2()
      )
    }

    const face = {
      a,
      b,
      c,
      normal: new Vector3(),
      materialIndex: 0
    }

    Triangle.getNormal(_vA, _vB, _vC, face.normal)

    intersection.face = face
  }

  return intersection
}
