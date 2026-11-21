import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';

function Surface({ terrain, route, start, goal }) {
  const geometry = useMemo(() => {
    const rows = terrain?.rows || 0;
    const cols = terrain?.cols || 0;
    const positions = [];
    const colors = [];
    const indices = [];
    if (!rows || !cols) return new THREE.BufferGeometry();
    const elev = terrain.elevation;
    const risk = terrain.risk;
    let min = Infinity, max = -Infinity;
    for (const row of elev) for (const v of row) { min = Math.min(min, v); max = Math.max(max, v); }
    const span = Math.max(max - min, 0.001);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        positions.push(c - cols / 2, ((elev[r][c] - min) / span) * 3.8, r - rows / 2);
        const t = risk[r][c];
        const isBlocked = Boolean(terrain.blocked?.[r]?.[c]);
        const color = isBlocked ? new THREE.Color('#151b22') : t >= .72 ? new THREE.Color('#db634d') : t >= .52 ? new THREE.Color('#ce914e') : t >= .3 ? new THREE.Color('#b7a95e') : new THREE.Color('#609a88');
        colors.push(color.r, color.g, color.b);
        if (r < rows - 1 && c < cols - 1) {
          const a = r * cols + c, b = a + 1, d = (r + 1) * cols + c, e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [terrain]);

  const to3D = (point) => point ? [point[1] - (terrain.cols || 0) / 2, 4.0, point[0] - (terrain.rows || 0) / 2] : null;
  const linePoints = useMemo(() => route.map(([r, c]) => [c - (terrain.cols || 0) / 2, 4.12, r - (terrain.rows || 0) / 2]), [route, terrain]);
  if (!terrain?.elevation) return null;
  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={1} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      {linePoints.length > 1 && <Line points={linePoints} color="#8cecff" lineWidth={2.5} />}
      {start && <mesh position={to3D(start)}><sphereGeometry args={[.7, 16, 16]} /><meshStandardMaterial color="#a6f0d1" emissive="#397b65" /></mesh>}
      {goal && <mesh position={to3D(goal)}><sphereGeometry args={[.7, 16, 16]} /><meshStandardMaterial color="#f3b56c" emissive="#87521e" /></mesh>}
    </>
  );
}

export default function Terrain3D({ terrain, route, start, goal }) {
  return (
    <div className="terrain-3d">
      <Canvas camera={{ position: [55, 55, 65], fov: 42 }}>
        <color attach="background" args={['#0b131c']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[30, 50, 15]} intensity={2.2} />
        <Surface terrain={terrain} route={route} start={start} goal={goal} />
        <gridHelper args={[90, 18, '#263d4a', '#182a35']} position={[0, -0.08, 0]} />
        <OrbitControls enableDamping minDistance={32} maxDistance={150} />
      </Canvas>
      <span className="view-hint">DRAG TO ROTATE · SCROLL TO ZOOM</span>
    </div>
  );
}
