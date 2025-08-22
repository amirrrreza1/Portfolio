"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { StatsGl, RoundedBox } from "@react-three/drei";

type Axis = "x" | "y" | "z";
type LayerIndex = -1 | 0 | 1;
type Turn = `${"U" | "D" | "L" | "R" | "F" | "B"}${"" | "'"}`;

const EPS = 0.0001;
const S = 1;
const GAP = 0.001;
const SPEED = 6;

const FACE_COLORS: Record<string, string> = {
  "+x": "#D32F2F",
  "-x": "#FF9800",
  "+y": "#FAFAFA",
  "-y": "#FDD835",
  "+z": "#1976D2",
  "-z": "#388E3C",
};

const allMoves: Turn[] = [
  "U",
  "U'",
  "D",
  "D'",
  "L",
  "L'",
  "R",
  "R'",
  "F",
  "F'",
  "B",
  "B'",
];

function rndMoves(n = 20): Turn[] {
  const res: Turn[] = [];
  for (let i = 0; i < n; i++) {
    const m = allMoves[Math.floor(Math.random() * allMoves.length)];
    if (res.length > 0) {
      const last = res[res.length - 1];
      const inv = invertMove(last as Turn);
      if (m === inv) {
        i--;
        continue;
      }
    }
    res.push(m as Turn);
  }
  return res;
}

function invertMove(m: Turn): Turn {
  return (m.endsWith("'") ? (m[0] as Turn) : ((m + "'") as Turn)) as Turn;
}

function moveToAxis(m: Turn): { axis: Axis; layer: LayerIndex; dir: 1 | -1 } {
  const prime = m.endsWith("'");
  const base = m[0];
  switch (base) {
    case "U":
      return { axis: "y", layer: 1, dir: prime ? -1 : 1 };
    case "D":
      return { axis: "y", layer: -1, dir: prime ? 1 : -1 };
    case "L":
      return { axis: "x", layer: -1, dir: prime ? -1 : 1 };
    case "R":
      return { axis: "x", layer: 1, dir: prime ? 1 : -1 };
    case "F":
      return { axis: "z", layer: 1, dir: prime ? -1 : 1 };
    case "B":
      return { axis: "z", layer: -1, dir: prime ? 1 : -1 };
  }
  return { axis: "y", layer: 1, dir: 1 };
}

class TurnAnimator {
  private group = new THREE.Group();
  private parent: THREE.Object3D;
  private active = false;
  private axis: Axis = "y";
  private dir: 1 | -1 = 1;
  private progress = 0;
  private speed = SPEED;
  constructor(parent: THREE.Object3D) {
    this.parent = parent;
    this.group.name = "turn-group";
    this.parent.add(this.group);
  }
  isBusy() {
    return this.active;
  }
  start(axis: Axis, children: THREE.Object3D[], dir: 1 | -1) {
    if (this.active) return;
    this.axis = axis;
    this.dir = dir;
    this.progress = 0;
    this.active = true;
    children.forEach((c) => this.group.attach(c));
  }
  update(dt: number) {
    if (!this.active) return;
    const target = (Math.PI / 2) * this.dir;
    const step = this.speed * dt * this.dir;
    if (this.axis === "x") this.group.rotation.x += step;
    if (this.axis === "y") this.group.rotation.y += step;
    if (this.axis === "z") this.group.rotation.z += step;
    this.progress += Math.abs(step);
    if (this.progress + 1e-4 >= Math.abs(target)) {
      if (this.axis === "x") this.group.rotation.x = target;
      if (this.axis === "y") this.group.rotation.y = target;
      if (this.axis === "z") this.group.rotation.z = target;
      const toDetach = [...this.group.children];
      toDetach.forEach((c) => {
        this.parent.attach(c);
      });
      this.group.rotation.set(0, 0, 0);
      this.group.updateMatrixWorld(true);
      this.active = false;
    }
  }
}

function useMoveQueue(
  containerRef: React.MutableRefObject<THREE.Object3D | null>
) {
  const animatorRef = useRef<TurnAnimator | null>(null);
  const queue = useRef<{ axis: Axis; layer: LayerIndex; dir: 1 | -1 }[]>([]);

  const enqueue = useCallback((m: Turn | Turn[]) => {
    const moves = Array.isArray(m) ? m : [m];
    moves.forEach((mv) => queue.current.push(moveToAxis(mv)));
  }, []);

  useFrame((_, dt) => {
    const parent = containerRef.current;
    if (!parent) return;
    if (!animatorRef.current) animatorRef.current = new TurnAnimator(parent);

    const animator = animatorRef.current!;
    if (animator.isBusy()) {
      animator.update(dt);
      return;
    }
    const next = queue.current.shift();
    if (!next) return;

    const layerPos = next.layer * (S + GAP);
    const children: THREE.Object3D[] = [];
    parent.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Object3D).userData?.cubie) children.push(o);
    });

    const selected = children.filter((c) => {
      const pWorld = new THREE.Vector3();
      c.getWorldPosition(pWorld);
      const pLocal = pWorld.clone();
      parent.worldToLocal(pLocal);
      const v = (pLocal as any)[next.axis] as number;
      return Math.abs(v - layerPos) < 0.5;
    });

    animator.start(next.axis, selected, next.dir);
  });

  return { enqueue };
}

function Cubie({ position }: { position: [number, number, number] }) {
  const pos = useMemo(() => new THREE.Vector3(...position), [position]);
  const ref = useRef<THREE.Group>(null!);

  const size = S - GAP;
  const radius = 0;
  const inset = size * 0.02;
  const sticker = size - inset * 2;
  const offset = size / 2 + 0.001;

  const t = (S + GAP) * 0.5 - EPS;
  const onPosX = pos.x > t;
  const onNegX = pos.x < -t;
  const onPosY = pos.y > t;
  const onNegY = pos.y < -t;
  const onPosZ = pos.z > t;
  const onNegZ = pos.z < -t;

  return (
    <group ref={ref} position={position as any} userData={{ cubie: true }}>
      <RoundedBox
        args={[size, size, size]}
        radius={radius}
        smoothness={6}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#151515" roughness={0.6} metalness={0.1} />
      </RoundedBox>

      {onPosX && (
        <mesh position={[offset, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[sticker, sticker]} />
          <meshStandardMaterial color={FACE_COLORS["+x"]} />
        </mesh>
      )}
      {onNegX && (
        <mesh position={[-offset, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[sticker, sticker]} />
          <meshStandardMaterial color={FACE_COLORS["-x"]} />
        </mesh>
      )}
      {onPosY && (
        <mesh position={[0, offset, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[sticker, sticker]} />
          <meshStandardMaterial color={FACE_COLORS["+y"]} />
        </mesh>
      )}
      {onNegY && (
        <mesh position={[0, -offset, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[sticker, sticker]} />
          <meshStandardMaterial color={FACE_COLORS["-y"]} />
        </mesh>
      )}
      {onPosZ && (
        <mesh position={[0, 0, offset]}>
          <planeGeometry args={[sticker, sticker]} />
          <meshStandardMaterial color={FACE_COLORS["+z"]} />
        </mesh>
      )}
      {onNegZ && (
        <mesh position={[0, 0, -offset]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[sticker, sticker]} />
          <meshStandardMaterial color={FACE_COLORS["-z"]} />
        </mesh>
      )}
    </group>
  );
}

function Cube() {
  const positions: [number, number, number][] = [];
  const o = S + GAP;
  for (let x of [-o, 0, o])
    for (let y of [-o, 0, o])
      for (let z of [-o, 0, o]) positions.push([x, y, z]);
  return (
    <group>
      {positions.map((p, i) => (
        <Cubie position={p} key={i} />
      ))}
    </group>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight intensity={1} position={[5, 8, 5]} />
    </>
  );
}

type HeroRubikProps = { width?: number; height?: number; className?: string };
export default function RubikCube({
  width = 420,
  height = 420,
  className,
}: HeroRubikProps) {
  const [api, setApi] = useState<{
    enqueue: (m: Turn | Turn[]) => void;
  } | null>(null);
  const onReady = useCallback(
    (v: { enqueue: (m: Turn | Turn[]) => void }) => setApi(v),
    []
  );
  return (
    <div
      className={`${className ?? ""} bg-primary m-0 p-0`}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <Canvas shadows camera={{ position: [6, 6, 8], fov: 45 }}>
        <SceneRoot onReady={onReady} />
        {/* <StatsGl /> */}
      </Canvas>
    </div>
  );
}

function SceneRoot({
  onReady,
}: {
  onReady: (api: { enqueue: (m: Turn | Turn[]) => void }) => void;
}) {
  const root = useRef<THREE.Group>(null!);
  const { enqueue } = useMoveQueue(root);

  useEffect(() => {
    onReady({ enqueue });
  }, [onReady, enqueue]);

  useEffect(() => {
    enqueue(rndMoves(30));
  }, [enqueue]);

  useEffect(() => {
    const id = setInterval(() => {
      enqueue(allMoves[Math.floor(Math.random() * allMoves.length)]);
    }, 900);
    return () => clearInterval(id);
  }, [enqueue]);

  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: any) => {
    dragging.current = true;
    last.current = {
      x: e.clientX ?? e.pointer?.x ?? 0,
      y: e.clientY ?? e.pointer?.y ?? 0,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: any) => {
    if (!dragging.current || !root.current || !last.current) return;
    const dx = (e.clientX ?? 0) - last.current.x;
    const dy = (e.clientY ?? 0) - last.current.y;
    const k = 0.01;
    root.current.rotation.y += dx * k;
    root.current.rotation.x += dy * k;
    root.current.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, root.current.rotation.x)
    );
    last.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
  };
  const onPointerUp = () => {
    dragging.current = false;
    last.current = null;
  };

  useFrame((_, dt) => {
    if (!root.current) return;
    if (!dragging.current) {
      root.current.rotation.y += dt * 0.38;
      root.current.rotation.x += dt * 0.23;
      root.current.rotation.z += dt * 0.17;
    }
  });

  const hitRadius = 2.2;

  return (
    <>
      <Lights />
      <group ref={root}>
        <Cube />
        <mesh
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <sphereGeometry args={[hitRadius, 16, 16]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      </group>
    </>
  );
}
