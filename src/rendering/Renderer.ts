import * as THREE from 'three'

export class Renderer {
  public readonly scene: THREE.Scene
  public readonly camera: THREE.PerspectiveCamera
  public readonly renderer: THREE.WebGLRenderer
  private readonly container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0b1020)
    this.scene.fog = new THREE.Fog(0x0b1020, 10, 28)

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100)
    this.camera.position.set(0, 2.3, 8)
    this.camera.lookAt(0, 1.5, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.shadowMap.enabled = true

    this.container.appendChild(this.renderer.domElement)
    this.handleResize = this.handleResize.bind(this)
    window.addEventListener('resize', this.handleResize)
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize)
    this.renderer.dispose()
  }

  private handleResize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }
}
