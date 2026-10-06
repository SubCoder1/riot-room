import * as THREE from "three";

export class Renderer {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;

    // ----------------------------------------
    // SCENE
    // ----------------------------------------

    this.scene = new THREE.Scene();

    this.scene.background = new THREE.Color(0x0b1020);

    this.scene.fog = new THREE.Fog(0x0b1020, 35, 90);

    // ----------------------------------------
    // SIZE
    // ----------------------------------------

    const width = Math.max(this.container.clientWidth, 1);

    const height = Math.max(this.container.clientHeight, 1);

    const aspect = width / height;

    // ----------------------------------------
    // CAMERA
    // ----------------------------------------

    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.01, 150);

    this.camera.position.set(0, 1.7, 0);

    this.camera.rotation.set(0, 0, 0);

    this.camera.layers.enableAll();

    /*
     * IMPORTANT:
     *
     * Add the camera to the scene.
     *
     * This allows objects attached to the
     * camera, such as the first-person arms,
     * to be traversed and rendered.
     */
    this.scene.add(this.camera);

    // ----------------------------------------
    // WEBGL RENDERER
    // ----------------------------------------

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.setSize(width, height, false);

    this.renderer.shadowMap.enabled = true;

    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.renderer.autoClear = true;

    // ----------------------------------------
    // CANVAS
    // ----------------------------------------

    this.renderer.domElement.style.display = "block";

    this.renderer.domElement.style.width = "100%";

    this.renderer.domElement.style.height = "100%";

    this.renderer.domElement.style.position = "absolute";

    this.renderer.domElement.style.left = "0";

    this.renderer.domElement.style.top = "0";

    this.renderer.domElement.style.zIndex = "0";

    this.container.appendChild(this.renderer.domElement);

    // ----------------------------------------
    // RESIZE
    // ----------------------------------------

    this.handleResize = this.handleResize.bind(this);

    window.addEventListener("resize", this.handleResize);
  }

  public render(): void {
    this.camera.updateMatrixWorld(true);

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);

    this.renderer.dispose();
  }

  private handleResize(): void {
    const width = Math.max(this.container.clientWidth, 1);

    const height = Math.max(this.container.clientHeight, 1);

    this.camera.aspect = width / height;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
  }
}
