import * as THREE from 'three'
import { InputManager } from '../input/InputManager'
import { MeleeAttack } from '../combat/MeleeAttack'

export class Player {
  public readonly attack: MeleeAttack
  public position = new THREE.Vector3(0, 1.7, 10)
  public velocity = new THREE.Vector3()
  public yaw = 0
  public pitch = -0.1

  private readonly moveSpeed = 5.5
  private readonly sprintSpeed = 8.5
  private readonly jumpForce = 7.2
  private readonly gravity = 18
  private readonly arenaHalfSize = 8.4
  private readonly eyeHeight = 1.7
  private grounded = true

  constructor() {
    this.attack = new MeleeAttack()
  }

  public update(dt: number, input: InputManager): void {
    this.yaw = input.yaw
    this.pitch = input.pitch

    const moveX = (input.isPressed('KeyD') ? 1 : 0) - (input.isPressed('KeyA') ? 1 : 0)
    const moveZ = (input.isPressed('KeyW') ? 1 : 0) - (input.isPressed('KeyS') ? 1 : 0)

    if (moveX !== 0 || moveZ !== 0) {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      const direction = new THREE.Vector3()
      direction.addScaledVector(forward, moveZ)
      direction.addScaledVector(right, moveX)
      direction.normalize()

      const speed = input.isPressed('ShiftLeft') || input.isPressed('ShiftRight') ? this.sprintSpeed : this.moveSpeed
      this.position.x += direction.x * speed * dt
      this.position.z += direction.z * speed * dt
    }

    if (input.consumeJump() && this.grounded) {
      this.velocity.y = this.jumpForce
      this.grounded = false
    }

    if (input.consumeAttack()) {
      this.attack.trigger()
    }

    this.velocity.y -= this.gravity * dt
    this.position.y += this.velocity.y * dt

    if (this.position.y <= this.eyeHeight) {
      this.position.y = this.eyeHeight
      this.velocity.y = 0
      this.grounded = true
    }

    this.position.x = clamp(this.position.x, -this.arenaHalfSize, this.arenaHalfSize)
    this.position.z = clamp(this.position.z, -this.arenaHalfSize, this.arenaHalfSize)

    this.attack.update(dt)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
