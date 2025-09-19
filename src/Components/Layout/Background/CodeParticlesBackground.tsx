"use client";

import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Particle } from "../Types";

const CODE_CHARS = ["{", "}", ";", "<>", "()", "const", "let", "=>", "[ ]"];

const LAYERS = [
  { count: 120, zOffset: -5 },
  { count: 80, zOffset: 0 },
  { count: 60, zOffset: 5 },
];

export const CodeParticlesBackground: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationIdRef = useRef<number | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      size.width / size.height,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    renderer.setSize(size.width, size.height);
    renderer.setClearColor(0x000000, 0);
    camera.position.z = 25;

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const getWorldDimensions = (z: number) => {
      const distance = camera.position.z - z;
      const vFOV = (camera.fov * Math.PI) / 180;
      const worldHeight = 2 * Math.tan(vFOV / 2) * distance;
      const worldWidth = worldHeight * camera.aspect;
      return { worldWidth, worldHeight };
    };

    const particles: Particle[] = [];

    LAYERS.forEach((layer, layerIndex) => {
      const { worldWidth, worldHeight } = getWorldDimensions(layer.zOffset);

      for (let i = 0; i < layer.count; i++) {
        const x = (Math.random() - 0.5) * worldWidth;
        const y = (Math.random() - 0.5) * worldHeight;
        const z = layer.zOffset + (Math.random() - 0.5) * 2;

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = 128;
        canvas.height = 128;

        context.font = "48px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";

        const char = CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        context.fillStyle = "#6b7280";

        context.fillText(char, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide,
        });

        const geometry = new THREE.PlaneGeometry(1.5, 1.5);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);

        const particle: Particle = {
          mesh,
          rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01
          ),
          layer: layerIndex,
          char,
        };

        particles.push(particle);
        scene.add(mesh);
      }
    });

    particlesRef.current = particles;

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      particles.forEach((p) => {
        p.mesh.rotation.x += p.rotationSpeed.x;
        p.mesh.rotation.y += p.rotationSpeed.y;
        p.mesh.rotation.z += p.rotationSpeed.z;
      });

      renderer.render(scene, camera);
    };

    mountRef.current.appendChild(renderer.domElement);
    animate();

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }

      if (
        mountRef.current &&
        renderer.domElement &&
        mountRef.current.contains(renderer.domElement)
      ) {
        mountRef.current.removeChild(renderer.domElement);
      }

      particles.forEach((p) => {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        (p.mesh.geometry as THREE.BufferGeometry).dispose();
      });

      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
};
