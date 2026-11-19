import { Environment, Float, Lightformer, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The TKP crown from the public New Members Connect site, re-used on the
 * admin sign-in screen only (never on work screens). Loaded lazily.
 */

/* Brand materials --------------------------------------------------------- */

function useMaterials() {
  return useMemo(
    () => ({
      gold: new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: 1, roughness: 0.22, envMapIntensity: 1.35 }),
      goldBright: new THREE.MeshStandardMaterial({
        color: "#f1d27a",
        metalness: 1,
        roughness: 0.12,
        emissive: "#7a5a10",
        emissiveIntensity: 0.25,
      }),
      ruby: new THREE.MeshPhysicalMaterial({
        color: "#9b1822",
        metalness: 0.1,
        roughness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        emissive: "#3a0306",
        emissiveIntensity: 0.6,
        flatShading: true,
      }),
      pearl: new THREE.MeshPhysicalMaterial({ color: "#fff6e6", roughness: 0.25, metalness: 0.2, clearcoat: 1, sheen: 1 }),
      velvet: new THREE.MeshStandardMaterial({ color: "#5a0a10", roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
      halo: new THREE.MeshBasicMaterial({ color: "#e9cf7a", transparent: true, opacity: 0.55, toneMapped: false }),
    }),
    [],
  );
}

/* The crown ---------------------------------------------------------------- */

function Crown() {
  const m = useMaterials();
  const POINTS = 8;
  const R = 1.2;

  const points = useMemo(
    () =>
      Array.from({ length: POINTS }, (_, i) => {
        const a = (i / POINTS) * Math.PI * 2;
        return { a, x: Math.cos(a) * R, z: Math.sin(a) * R };
      }),
    [],
  );
  const jewels = useMemo(
    () =>
      Array.from({ length: POINTS }, (_, i) => {
        const a = ((i + 0.5) / POINTS) * Math.PI * 2;
        return { a, x: Math.cos(a) * (R + 0.04), z: Math.sin(a) * (R + 0.04), ruby: i % 2 === 0 };
      }),
    [],
  );

  return (
    <group>
      {/* Band */}
      <mesh material={m.gold} castShadow>
        <cylinderGeometry args={[R, R * 1.04, 0.5, 96, 1, true]} />
      </mesh>
      <mesh material={m.goldBright} position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, 0.055, 16, 96]} />
      </mesh>
      <mesh material={m.goldBright} position={[0, -0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 1.04, 0.07, 16, 96]} />
      </mesh>

      {/* Velvet cap */}
      <mesh material={m.velvet} position={[0, 0.2, 0]} scale={[1, 0.82, 1]}>
        <sphereGeometry args={[R * 0.97, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>

      {/* Points with pearls */}
      {points.map((p, i) => (
        <group key={i} position={[p.x, 0.62, p.z]} rotation={[0, -p.a, 0]}>
          <mesh material={m.gold} rotation={[0, 0, -0.08]}>
            <coneGeometry args={[0.2, 0.75, 4]} />
          </mesh>
          <mesh material={m.pearl} position={[0, 0.44, 0]}>
            <sphereGeometry args={[0.085, 24, 24]} />
          </mesh>
        </group>
      ))}

      {/* Jewels around the band */}
      {jewels.map((j, i) => (
        <mesh
          key={i}
          material={j.ruby ? m.ruby : m.goldBright}
          position={[j.x, 0, j.z]}
          rotation={[0, -j.a + Math.PI / 2, Math.PI / 4]}
          scale={j.ruby ? [0.14, 0.14, 0.07] : [0.09, 0.09, 0.09]}
        >
          {j.ruby ? <octahedronGeometry args={[1, 0]} /> : <sphereGeometry args={[1, 16, 16]} />}
        </mesh>
      ))}

      {/* Arches meeting at the top */}
      {[0, Math.PI / 2].map((rot) => (
        <mesh key={rot} material={m.gold} position={[0, 0.25, 0]} rotation={[0, rot, 0]} scale={[1, 1.05, 1]}>
          <torusGeometry args={[R * 0.98, 0.05, 16, 64, Math.PI]} />
        </mesh>
      ))}

      {/* Orb + cross */}
      <mesh material={m.goldBright} position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.16, 32, 32]} />
      </mesh>
      <group position={[0, 1.88, 0]}>
        <mesh material={m.goldBright}>
          <boxGeometry args={[0.09, 0.46, 0.09]} />
        </mesh>
        <mesh material={m.goldBright} position={[0, 0.06, 0]}>
          <boxGeometry args={[0.3, 0.09, 0.09]} />
        </mesh>
      </group>
    </group>
  );
}

/* Halo of light behind the crown ------------------------------------------- */

function Halo() {
  const m = useMaterials();
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.08;
  });
  return (
    <group ref={ref} position={[0, 0.6, -1.4]}>
      <mesh material={m.halo}>
        <torusGeometry args={[2.3, 0.012, 8, 160]} />
      </mesh>
      <mesh material={m.halo} scale={1.14}>
        <torusGeometry args={[2.3, 0.006, 8, 160]} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <mesh key={i} material={m.halo} position={[Math.cos(a) * 2.45, Math.sin(a) * 2.45, 0]} rotation={[0, 0, a]}>
            <boxGeometry args={[i % 2 ? 0.18 : 0.32, 0.012, 0.012]} />
          </mesh>
        );
      })}
    </group>
  );
}

/* Floating gems ------------------------------------------------------------ */

function Gems({ count }: { count: number }) {
  const m = useMaterials();
  const gems = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        const r = 2.6 + (i % 3) * 0.55;
        return {
          pos: [Math.cos(a) * r, Math.sin(a * 1.7) * 1.4 + 0.4, Math.sin(a) * 1.2 - 1] as [number, number, number],
          scale: 0.1 + ((i * 37) % 10) / 70,
          ruby: i % 3 === 0,
          speed: 1 + (i % 4) * 0.35,
        };
      }),
    [count],
  );
  return (
    <>
      {gems.map((g, i) => (
        <Float key={i} speed={g.speed} rotationIntensity={2} floatIntensity={1.4}>
          <mesh position={g.pos} scale={g.scale} material={g.ruby ? m.ruby : m.gold}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        </Float>
      ))}
    </>
  );
}

/* Rig: gentle spin + pointer parallax ------------------------------------- */

function Rig({ compact }: { compact: boolean }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const g = group.current;
    const s = spin.current;
    if (!g || !s) return;
    const vp = state.viewport;
    // Fit the halo (about 5.4 units across) into the panel with a margin.
    const base = Math.min(compact ? 0.62 : 0.8, (vp.height * 0.8) / 5.6, (vp.width * 0.9) / 5.6);
    s.rotation.y += dt * 0.25;
    s.rotation.x = THREE.MathUtils.damp(s.rotation.x, 0.2 - state.pointer.y * 0.12, 3, dt);
    g.position.x = THREE.MathUtils.damp(g.position.x, state.pointer.x * 0.25, 3, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, -0.55 * base + state.pointer.y * 0.15, 3, dt);
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, base, 3, dt));
  });

  return (
    <group ref={group} scale={0.001}>
      <Halo />
      <group ref={spin}>
        <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.6}>
          <Crown />
        </Float>
        <Gems count={compact ? 6 : 12} />
      </group>
    </group>
  );
}

export default function CrownScene({ active, compact }: { active: boolean; compact: boolean }) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={compact ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, 0, 7], fov: 38 }}
      gl={{ antialias: !compact, alpha: true, powerPreference: "high-performance" }}
      eventSource={document.body}
      eventPrefix="client"
      aria-hidden
    >
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} color="#fff1cf" />
      <pointLight position={[-4, -1, 2]} intensity={7} color="#b4232c" distance={12} />
      <Environment resolution={compact ? 128 : 256} frames={1}>
        <Lightformer form="rect" intensity={3} color="#fff4d6" position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={2} color="#ffd98a" position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#c2414a" position={[5, 0, 0]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="ring" intensity={2.5} color="#fff" position={[0, 1, -5]} scale={3} />
      </Environment>
      <Rig compact={compact} />
      <Sparkles count={compact ? 40 : 90} scale={[10, 7, 5]} size={compact ? 2.5 : 3.2} speed={0.35} opacity={0.85} color="#f1d27a" />
    </Canvas>
  );
}
