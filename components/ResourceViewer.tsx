import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const ResourceViewer: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [colorMode, setColorMode] = useState<'blue' | 'white'>('blue');

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.35);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.4);
    dir.position.set(0, 200, 100);
    scene.add(dir);
    // Helpful scene helpers so user sees context even if mesh fails
    const axes = new THREE.AxesHelper(50);
    scene.add(axes);
    const grid = new THREE.GridHelper(200, 20, 0x22303b, 0x1b2730);
    (grid.material as any).opacity = 0.25;
    (grid.material as any).transparent = true;
    scene.add(grid);

    const loader = new STLLoader();
    let mesh: THREE.Mesh | null = null;
    // store mesh on ref so other effects can access it
    const meshRef = (mountRef as any).__meshRef || { current: null };
    (mountRef as any).__meshRef = meshRef;
    setError(null);
    setLoading(true);

    // Fetch file as ArrayBuffer and parse for robust loading (binary or ascii)
    console.log('ResourceViewer: fetching', url);
    fetch(url)
      .then(async (res) => {
        console.log('ResourceViewer: fetch response', res.status, res.headers.get('content-type'));
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
        const buffer = await res.arrayBuffer();
        console.log('ResourceViewer: got buffer', buffer?.byteLength);
        return buffer;
      })
      .then((buffer) => {
        try {
          const geometry = loader.parse(buffer as ArrayBuffer);
          console.log('ResourceViewer: geometry parsed', geometry && (geometry as any).attributes ? Object.keys((geometry as any).attributes) : geometry);

          // detect if parsed geometry actually contains vertices/triangles
          const posAttr = (geometry as any).attributes && (geometry as any).attributes.position;
          const vertCount = posAttr ? (posAttr.count || (posAttr.array ? posAttr.array.length / 3 : 0)) : 0;
          if (!vertCount) {
            console.warn('ResourceViewer: parsed geometry contains no vertices/triangles (count=' + vertCount + ')');
            setError('STL parsed but contains no triangles');
          } else {
            const matColor = colorMode === 'blue' ? 0x9ecbff : 0xf5f7fa;
              const material = new THREE.MeshStandardMaterial({ color: matColor, metalness: 0.05, roughness: 0.45 });
              mesh = new THREE.Mesh(geometry, material);
            if ((geometry as any).computeBoundingBox) (geometry as any).computeBoundingBox();
            const bbox = (geometry as any).boundingBox;
            if (bbox) {
              const size = new THREE.Vector3();
              bbox.getSize(size);
              const center = new THREE.Vector3();
              bbox.getCenter(center);
              mesh.position.sub(center);
              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              const fitDistance = maxDim * 1.8;
              camera.position.set(0, 0, fitDistance);
            }
            scene.add(mesh);
            meshRef.current = mesh;
            console.log('ResourceViewer: geometry added', url);
            controls.target.set(0, 0, 0);
            controls.update();
            setError(null);
          }
        } catch (e: any) {
          console.error('STL parse error', e);
          setError(String(e?.message || e));
        }
      })
      .catch((e) => {
        console.error('Failed fetching STL', e);
        setError(String(e?.message || e));
      })
      .finally(() => setLoading(false));

    // No placeholder box — we only render actual geometry when available.

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ensure renderer background matches scene to avoid DOM white flashes
    try { renderer.setClearColor((scene.background as THREE.Color) || new THREE.Color(0x0b1220)); } catch (e) {}
    if (mountRef.current) mountRef.current.style.background = '#0b1220';

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // cleanup will clear meshRef below

    return () => {
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      // no placeholder to clear
      // dispose mesh via meshRef if present
      try {
        const mr = (mountRef as any).__meshRef;
        const m = mr && mr.current ? mr.current : mesh;
        if (m) {
          m.geometry && m.geometry.dispose();
          if (Array.isArray((m as any).material)) {
            (m as any).material.forEach((mat: any) => mat.dispose());
          } else {
            (m as any).material && (m as any).material.dispose();
          }
        }
      } catch (e) {}
      try { if ((mountRef as any).__meshRef) (mountRef as any).__meshRef.current = null; } catch {}
      try { container.removeChild(renderer.domElement); } catch {}
    };
  }, [url]);

  // Update mesh material immediately when colorMode changes to avoid white flash
  useEffect(() => {
    try {
      const meshRefAny = (mountRef as any).__meshRef;
      const m: any = meshRefAny && meshRefAny.current;
      if (!m || !m.material) return;
      const newColor = colorMode === 'blue' ? 0x9ecbff : 0xf5f7fa;
      const targetRoughness = colorMode === 'white' ? 0.8 : 0.45;
      const targetMetalness = colorMode === 'white' ? 0.02 : 0.05;

      const applyToMat = (mat: any) => {
        if (mat.color && typeof mat.color.setHex === 'function') mat.color.setHex(newColor);
        if (typeof mat.roughness !== 'undefined') mat.roughness = targetRoughness;
        if (typeof mat.metalness !== 'undefined') mat.metalness = targetMetalness;
        mat.emissive && (mat.emissive.setHex && mat.emissive.setHex(0x000000));
        mat.needsUpdate = true;
      };

      if (Array.isArray(m.material)) {
        m.material.forEach((mat: any) => applyToMat(mat));
      } else {
        applyToMat(m.material);
      }
    } catch (e) {
      // ignore
    }
  }, [colorMode]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/60">
      <div className="w-full max-w-4xl h-[70vh] bg-white rounded-2xl overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-4">
            <div className="text-sm font-bold">3D Preview</div>
            <div className="text-xs text-slate-400">Color:</div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setColorMode('blue'); }} className={`px-3 py-1 rounded ${colorMode === 'blue' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Blue</button>
              <button onClick={() => { setColorMode('white'); }} className={`px-3 py-1 rounded ${colorMode === 'white' ? 'bg-white text-slate-800 border' : 'bg-slate-100 text-slate-700'}`}>White</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && <div className="text-xs text-slate-500">Loading…</div>}
            {error && <div className="text-xs text-rose-500">{error}</div>}
            <button
              onClick={onClose}
              className="text-xs px-3 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-white"
            >
              Close
            </button>
          </div>
        </div>
        <div className="relative" style={{ width: '100%', height: 'calc(100% - 48px)' }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {!error && loading && <div className="text-sm text-white/80 bg-black/30 px-4 py-2 rounded">Loading 3D model…</div>}
            {error && <div className="text-sm text-rose-300 bg-black/30 px-4 py-2 rounded">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceViewer;
