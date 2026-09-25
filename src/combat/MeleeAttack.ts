import * as THREE from 'three'

export class MeleeAttack {
  public readonly group: THREE.Group
  private readonly arm: THREE.Mesh
  private readonly fist: THREE.Mesh
  private readonly duration = 0.14
  private timer = 0
  private active = false

  constructor() {
    this.group = new THREE.Group()

    const armMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4c9a8,
      emissive: 0x412711,
      roughness: 0.9,
    })
    const fistMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      emissive: 0x2d1658,
      roughness: 0.8,
    })

    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.9), armMaterial)
    this.arm.position.set(0.62, -0.72, -0.68)
    this.arm.rotation.x = 0.2

    this.fist = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 20), fistMaterial)
    this.fist.position.set(0.62, -0.72, -1.22)

    this.group.add(this.arm, this.fist)
    this.group.visible = false
  }

  public trigger(): void {
    this.timer = this.duration
    this.active = true
    this.group.visible = true
  }

  public update(dt: number): void {
    if (!this.active) {
      this.group.visible = false
      return
    }

    this.timer -= dt
    const progress = 1 - this.timer / this.duration
    const punchDistance = Math.sin(progress * Math.PI) * 1.05

    this.arm.position.z = -0.68 - punchDistance
    this.fist.position.z = -1.22 - punchDistance
    this.arm.rotation.x = 0.2 + punchDistance * 0.8

    if (this.timer <= 0) {
      this.active = false
      this.group.visible = false
    }
  }

  public setFromCamera(camera: THREE.PerspectiveCamera): void {
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()

    this.group.position.copy(camera.position)
    this.group.position.addScaledVector(forward, 1.1)
    this.group.position.addScaledVector(right, 0.7)
    this.group.position.addScaledVector(up, -0.38)

    this.group.quaternion.copy(camera.quaternion)
    this.group.rotateY(-0.2)
    this.group.rotateX(0.25)
  }

  public isActive(): boolean {
    return this.active
  }
}
