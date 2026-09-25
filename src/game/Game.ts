import { Renderer } from '../rendering/Renderer'
import { InputManager } from '../input/InputManager'
import { Player } from '../player/Player'
import { Arena } from '../world/Arena'

export class Game {
  private readonly renderer: Renderer
  private readonly arena: Arena
  private readonly input: InputManager
  private readonly player: Player
  private lastFrameTime: number

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container)
    this.arena = new Arena()
    this.input = new InputManager(this.renderer.renderer.domElement)
    this.player = new Player()
    this.lastFrameTime = performance.now()

    this.renderer.scene.add(this.arena.group)
    this.renderer.scene.add(this.player.attack.group)
    this.renderer.camera.position.copy(this.player.position)
    this.renderer.camera.rotation.order = 'YXZ'

    this.animate = this.animate.bind(this)
    requestAnimationFrame(this.animate)
  }

  private animate(): void {
    const currentTime = performance.now()
    const elapsedSeconds = (currentTime - this.lastFrameTime) / 1000
    this.lastFrameTime = currentTime

    this.player.update(elapsedSeconds, this.input)

    this.renderer.camera.position.copy(this.player.position)
    this.renderer.camera.rotation.y = this.player.yaw
    this.renderer.camera.rotation.x = this.player.pitch
    this.player.attack.setFromCamera(this.renderer.camera)

    this.renderer.render()
    requestAnimationFrame(this.animate)
  }
}
