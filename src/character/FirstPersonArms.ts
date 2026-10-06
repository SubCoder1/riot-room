import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

/*
 * Original Polyfork arm bones.
 *
 * We use the actual Polyfork skeleton.
 * No manual arm posing is performed.
 */
const ARM_BONE_NAMES = new Set<string>([
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",

  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
]);

/*
 * Controls how much of a vertex must be influenced
 * by an arm bone before it is included.
 */
const ARM_WEIGHT_THRESHOLD = 0.2;

export class FirstPersonArms {
  public readonly group: THREE.Group;

  private readonly sourceCharacter: THREE.Object3D;

  private viewModelRoot: THREE.Object3D | null = null;

  private sourceSkeleton: THREE.Skeleton | null = null;
  private viewModelSkeleton: THREE.Skeleton | null = null;

  private sourceBonesByName = new Map<string, THREE.Bone>();

  private viewModelBonesByName = new Map<string, THREE.Bone>();

  private armMesh: THREE.SkinnedMesh | null = null;

  private readonly guardPose: Record<string, THREE.Quaternion> = {
    LeftShoulder: new THREE.Quaternion(
      -0.0008246337,
      0.0510837375,
      -0.0527774484,
      0.9972985073,
    ),
    LeftArm: new THREE.Quaternion(0.125, -0.27, -0.245, 0.92).normalize(),
    LeftForeArm: new THREE.Quaternion(
      -0.0757570788,
      -0.6287024617,
      0.2795023024,
      0.7217149734,
    ).normalize(),
    LeftHand: new THREE.Quaternion(
      -0.0436933935,
      -0.4157148898,
      0.3780051768,
      0.8260654211,
    ).normalize(),
    RightShoulder: new THREE.Quaternion(
      0.0096879505,
      0.0290022876,
      -0.0242006557,
      0.9992393803,
    ),
    RightArm: new THREE.Quaternion(0.016, 0.27, 0.29, 0.92).normalize(),
    RightForeArm: new THREE.Quaternion(
      -0.0528877601,
      0.6395993829,
      -0.2210823298,
      0.7343283892,
    ).normalize(),
    RightHand: new THREE.Quaternion(
      -0.0471633449,
      0.4487292469,
      -0.3162814975,
      0.8344960809,
    ).normalize(),
  };

  /*
   * Position of the original Polyfork model
   * relative to the first-person camera.
   */
  private readonly viewModelPosition = new THREE.Vector3(0, -0.55, -0.72);

  /*
   * Polyfork model faces the opposite local direction,
   * so rotate it 180 degrees around Y.
   */
  private readonly viewModelRotation = new THREE.Euler(0, Math.PI, 0);

  private readonly viewModelScale = 1;

  constructor(sourceCharacter: THREE.Object3D) {
    this.sourceCharacter = sourceCharacter;

    this.group = new THREE.Group();

    this.group.name = "FirstPersonArms";

    this.build();
  }

  private build(): void {
    /*
     * Find the original Polyfork SkinnedMesh.
     */
    const sourceMesh = this.findSkinnedMesh(this.sourceCharacter);

    if (!sourceMesh) {
      console.error("FirstPersonArms: could not find Polyfork SkinnedMesh.");

      return;
    }

    /*
     * Original Polyfork skeleton.
     */
    this.sourceSkeleton = sourceMesh.skeleton;

    /*
     * Store source bones by name.
     */
    for (const bone of this.sourceSkeleton.bones) {
      this.sourceBonesByName.set(bone.name, bone);
    }

    /*
     * Clone the complete Polyfork hierarchy.
     *
     * This preserves the original:
     * - geometry
     * - skeleton
     * - bones
     * - skinning
     * - materials
     */
    const clonedCharacter = SkeletonUtils.clone(this.sourceCharacter);

    clonedCharacter.name = "FirstPersonPolyforkViewModel";

    this.viewModelRoot = clonedCharacter;

    /*
     * Position the cloned Polyfork relative
     * to the FPS camera.
     */
    this.viewModelRoot.position.copy(this.viewModelPosition);

    this.viewModelRoot.rotation.copy(this.viewModelRotation);

    this.viewModelRoot.scale.setScalar(this.viewModelScale);

    /*
     * We don't render the complete cloned character.
     *
     * The skeleton remains active because the extracted
     * arm mesh will use its bones.
     */
    this.viewModelRoot.traverse((object) => {
      object.visible = false;
    });

    /*
     * Find the cloned Polyfork SkinnedMesh.
     */
    const clonedMesh = this.findSkinnedMesh(clonedCharacter);

    if (!clonedMesh) {
      console.error(
        "FirstPersonArms: could not find cloned Polyfork SkinnedMesh.",
      );

      return;
    }

    /*
     * Cloned skeleton.
     */
    this.viewModelSkeleton = clonedMesh.skeleton;

    /*
     * Store cloned bones by name.
     */
    for (const bone of this.viewModelSkeleton.bones) {
      this.viewModelBonesByName.set(bone.name, bone);
    }

    /*
     * Create a geometry containing only the
     * original Polyfork arm/hand triangles.
     */
    const armGeometry = this.createArmGeometry(
      sourceMesh.geometry,
      sourceMesh.skeleton,
    );

    if (!armGeometry) {
      console.error("FirstPersonArms: failed to create arm geometry.");

      return;
    }

    /*
     * Use the original Polyfork material.
     */
    const armMesh = new THREE.SkinnedMesh(armGeometry, clonedMesh.material);

    armMesh.name = "OriginalPolyforkArms";

    /*
     * Bind the arm geometry to the cloned
     * Polyfork skeleton.
     */
    armMesh.bind(this.viewModelSkeleton, clonedMesh.bindMatrix.clone());

    /*
     * The camera is very close to the arms,
     * so disable frustum culling.
     */
    armMesh.frustumCulled = false;

    armMesh.castShadow = false;
    armMesh.receiveShadow = false;

    /*
     * Add the arm mesh to the same hierarchy
     * as the cloned Polyfork mesh.
     */
    const clonedMeshParent = clonedMesh.parent;

    if (!clonedMeshParent) {
      console.error("FirstPersonArms: cloned mesh has no parent.");

      return;
    }

    clonedMeshParent.add(armMesh);

    this.armMesh = armMesh;

    /*
     * Attach the complete cloned hierarchy
     * to the first-person group.
     */
    this.group.add(this.viewModelRoot);

    this.group.visible = true;
  }

  public update(): void {
    if (
      !this.sourceSkeleton ||
      !this.viewModelSkeleton ||
      !this.viewModelRoot
    ) {
      return;
    }

    /*
     * Copy the LOCAL transforms from the animated
     * original Polyfork skeleton to the first-person
     * Polyfork skeleton.
     *
     * The Mixamo animation therefore controls
     * the real Polyfork arm geometry.
     */
    for (const sourceBone of this.sourceSkeleton.bones) {
      const targetBone = this.viewModelBonesByName.get(sourceBone.name);

      if (!targetBone) {
        continue;
      }

      targetBone.position.copy(sourceBone.position);
      targetBone.scale.copy(sourceBone.scale);

      const guardQuaternion = this.guardPose[sourceBone.name];

      if (guardQuaternion) {
        /*
         * FPP arms are deliberately independent from the
         * character's walk arm tracks. This guarantees the
         * fists stay in the requested FPS guard pose.
         */
        targetBone.quaternion.copy(guardQuaternion);
      } else {
        targetBone.quaternion.copy(sourceBone.quaternion);
      }
    }

    /*
     * Update cloned hierarchy.
     */
    this.viewModelRoot.updateMatrixWorld(true);

    /*
     * Make sure the actual arm mesh remains visible.
     */
    if (this.armMesh) {
      this.armMesh.visible = true;
    }
  }

  private findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
    let result: THREE.SkinnedMesh | null = null;

    root.traverse((object) => {
      if (result === null && object instanceof THREE.SkinnedMesh) {
        result = object;
      }
    });

    return result;
  }

  private createArmGeometry(
    sourceGeometry: THREE.BufferGeometry,
    skeleton: THREE.Skeleton,
  ): THREE.BufferGeometry | null {
    const position = sourceGeometry.getAttribute("position");

    const normal = sourceGeometry.getAttribute("normal");

    const uv = sourceGeometry.getAttribute("uv");

    const skinIndex = sourceGeometry.getAttribute("skinIndex");

    const skinWeight = sourceGeometry.getAttribute("skinWeight");

    if (!position || !skinIndex || !skinWeight) {
      console.error(
        "FirstPersonArms: source geometry is missing skin attributes.",
      );

      return null;
    }

    /*
     * Find the bone indices used by the
     * Polyfork arm bones.
     */
    const armBoneIndices = new Set<number>();

    for (let i = 0; i < skeleton.bones.length; i++) {
      const bone = skeleton.bones[i];

      if (ARM_BONE_NAMES.has(bone.name)) {
        armBoneIndices.add(i);
      }
    }

    if (armBoneIndices.size === 0) {
      console.error("FirstPersonArms: no Polyfork arm bones found.");

      return null;
    }

    /*
     * Determine whether each vertex belongs
     * strongly enough to the arms.
     */
    const vertexIsArm = new Array<boolean>(position.count);

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex++) {
      let armWeight = 0;

      for (let influence = 0; influence < 4; influence++) {
        /*
         * IMPORTANT:
         *
         * BufferAttribute.getComponent()
         * expects:
         *
         * getComponent(index, component)
         */
        const boneIndex = skinIndex.getComponent(vertexIndex, influence);

        const weight = skinWeight.getComponent(vertexIndex, influence);

        if (armBoneIndices.has(boneIndex)) {
          armWeight += weight;
        }
      }

      vertexIsArm[vertexIndex] = armWeight >= ARM_WEIGHT_THRESHOLD;
    }

    /*
     * Read triangles from the original geometry.
     */
    const sourceIndex = sourceGeometry.index;

    const triangleCount = sourceIndex
      ? sourceIndex.count / 3
      : position.count / 3;

    const getSourceVertexIndex = (triangle: number, corner: number): number => {
      const indexPosition = triangle * 3 + corner;

      if (sourceIndex) {
        return sourceIndex.getX(indexPosition);
      }

      return indexPosition;
    };

    /*
     * Keep triangles where at least two vertices
     * are influenced by arm bones.
     */
    const keptTriangles: Array<[number, number, number]> = [];

    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const a = getSourceVertexIndex(triangle, 0);

      const b = getSourceVertexIndex(triangle, 1);

      const c = getSourceVertexIndex(triangle, 2);

      let armVertexCount = 0;

      if (vertexIsArm[a]) {
        armVertexCount++;
      }

      if (vertexIsArm[b]) {
        armVertexCount++;
      }

      if (vertexIsArm[c]) {
        armVertexCount++;
      }

      if (armVertexCount >= 2) {
        keptTriangles.push([a, b, c]);
      }
    }

    /*
     * Remap selected vertices.
     */
    const vertexMap = new Map<number, number>();

    const selectedVertices: number[] = [];

    for (const triangle of keptTriangles) {
      for (const sourceVertex of triangle) {
        if (!vertexMap.has(sourceVertex)) {
          const newIndex = selectedVertices.length;

          vertexMap.set(sourceVertex, newIndex);

          selectedVertices.push(sourceVertex);
        }
      }
    }

    if (selectedVertices.length === 0) {
      console.error("FirstPersonArms: no arm vertices were selected.");

      return null;
    }

    /*
     * ===============================================
     * POSITIONS
     * ===============================================
     */
    const positions: number[] = [];

    for (const sourceVertex of selectedVertices) {
      positions.push(
        position.getX(sourceVertex),
        position.getY(sourceVertex),
        position.getZ(sourceVertex),
      );
    }

    /*
     * ===============================================
     * NORMALS
     * ===============================================
     */
    const normals: number[] = [];

    if (normal) {
      for (const sourceVertex of selectedVertices) {
        normals.push(
          normal.getX(sourceVertex),
          normal.getY(sourceVertex),
          normal.getZ(sourceVertex),
        );
      }
    }

    /*
     * ===============================================
     * UV
     * ===============================================
     */
    const uvs: number[] = [];

    if (uv) {
      for (const sourceVertex of selectedVertices) {
        uvs.push(uv.getX(sourceVertex), uv.getY(sourceVertex));
      }
    }

    /*
     * ===============================================
     * SKIN INDICES
     * ===============================================
     */
    const skinIndices: number[] = [];

    for (const sourceVertex of selectedVertices) {
      for (let influence = 0; influence < 4; influence++) {
        skinIndices.push(skinIndex.getComponent(sourceVertex, influence));
      }
    }

    /*
     * ===============================================
     * SKIN WEIGHTS
     * ===============================================
     */
    const skinWeights: number[] = [];

    for (const sourceVertex of selectedVertices) {
      for (let influence = 0; influence < 4; influence++) {
        skinWeights.push(skinWeight.getComponent(sourceVertex, influence));
      }
    }

    /*
     * ===============================================
     * CREATE GEOMETRY
     * ===============================================
     */
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    if (normals.length > 0) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
    }

    if (uvs.length > 0) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }

    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(skinIndices, 4),
    );

    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(skinWeights, 4),
    );

    /*
     * ===============================================
     * TRIANGLE INDICES
     * ===============================================
     */
    const indices: number[] = [];

    for (const triangle of keptTriangles) {
      const a = vertexMap.get(triangle[0]);

      const b = vertexMap.get(triangle[1]);

      const c = vertexMap.get(triangle[2]);

      if (a === undefined || b === undefined || c === undefined) {
        continue;
      }

      indices.push(a, b, c);
    }

    geometry.setIndex(indices);

    /*
     * Some models already have normals.
     * If Polyfork doesn't, generate them.
     */
    if (!normal) {
      geometry.computeVertexNormals();
    }

    geometry.computeBoundingSphere();

    return geometry;
  }

  public dispose(): void {
    /*
     * This geometry belongs specifically to
     * the first-person arm mesh.
     */
    if (this.armMesh) {
      this.armMesh.geometry.dispose();
    }

    /*
     * Do NOT dispose the material because it is
     * shared with the original Polyfork character.
     */
    this.group.clear();

    this.viewModelRoot = null;
    this.sourceSkeleton = null;
    this.viewModelSkeleton = null;
    this.armMesh = null;

    this.sourceBonesByName.clear();
    this.viewModelBonesByName.clear();
  }
}
