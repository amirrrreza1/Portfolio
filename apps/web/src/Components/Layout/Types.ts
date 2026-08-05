import * as THREE from "three";

export interface Particle {
  mesh: THREE.Mesh;
  rotationSpeed: THREE.Vector3;
  layer: number;
  char: string;
}
