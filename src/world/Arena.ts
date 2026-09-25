import * as THREE from 'three'

export class Arena {
  public readonly group: THREE.Group

  constructor() {
    this.group = new THREE.Group()
    this.buildArena()
  }

  private buildArena(): void {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.4, 20),
      new THREE.MeshStandardMaterial({
        color: 0x576d86,
        roughness: 0.9,
        metalness: 0.15,
      }),
    )
    floor.position.y = -0.2
    floor.receiveShadow = true
    this.group.add(floor)

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3a4c,
      roughness: 0.8,
      metalness: 0.25,
    })

    const wallHeight = 4
    const wallThickness = 0.45
    const wallLength = 20
    const wallData = [
      { size: [wallLength, wallHeight, wallThickness] as const, position: [0, wallHeight / 2, -wallLength / 2] as const },
      { size: [wallLength, wallHeight, wallThickness] as const, position: [0, wallHeight / 2, wallLength / 2] as const },
      { size: [wallThickness, wallHeight, wallLength] as const, position: [-wallLength / 2, wallHeight / 2, 0] as const },
      { size: [wallThickness, wallHeight, wallLength] as const, position: [wallLength / 2, wallHeight / 2, 0] as const },
    ]

    wallData.forEach(({ size, position }) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMaterial)
      const [x, y, z] = position
      wall.position.set(x, y, z)
      wall.castShadow = true
      wall.receiveShadow = true
      this.group.add(wall)
    })

    const ambientLight = new THREE.HemisphereLight(0xdfeeff, 0x111827, 1.5)
    ambientLight.position.set(0, 8, 0)
    this.group.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
    keyLight.position.set(4, 9, 6)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    this.group.add(keyLight)

    const rimLight = new THREE.PointLight(0x7dd3fc, 1.2, 30, 2)
    rimLight.position.set(-6, 3, -5)
    this.group.add(rimLight)
  }
}
