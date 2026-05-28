"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useFilteredEvents } from "@/lib/store/selectors";
import { COLORS, labelColor } from "@/lib/charts/colors";
import { eventInteractions } from "@/lib/format";
import type { EventItem } from "@/lib/charts/types";

interface StarMesh extends THREE.Mesh {
  userData: {
    event: EventItem;
    angle: number;
    radius: number;
    yJitter: number;
    baseColor: THREE.Color;
    size: number;
    halo?: THREE.Mesh;
    haloBaseOpacity?: number;
    trail?: THREE.Line;
    trailSpan: number;
    trailN: number;
    currentAngle: number;
  };
}

interface OrbitRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  raf: number;
  stars: Map<string, StarMesh>;
  resizeObserver: ResizeObserver;
  isVisible: boolean;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  pointerHandler: (event: PointerEvent) => void;
}

const TRAIL_N = 18;
const STAR_LIMIT = 24;

export function OrbitScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<OrbitRefs | null>(null);
  const data = useDashboardStore((s) => s.data);
  const events = useFilteredEvents();
  const selectedId = useDashboardStore((s) => s.selectedId);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const [autoRotate, setAutoRotate] = useState(true);

  // Top N events by total interactions — what actually becomes stars.
  const topEvents = useMemo(() => {
    return events
      .slice()
      .sort((a, b) => eventInteractions(b) - eventInteractions(a))
      .slice(0, STAR_LIMIT);
  }, [events]);

  // Mount once: build the renderer, scene, controls, lights, grid, ring lines,
  // start the animation loop, attach pointer + IntersectionObserver.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 1000);
    camera.position.set(0, 12, 32);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 18;
    controls.maxDistance = 70;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    // Lights — same flat industrial setup as the original
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
    keyLight.position.set(8, 12, 6);
    scene.add(keyLight);

    // Ground grid — picks up the v0 INTERFACE 60px grid theme in 3D space
    const grid = new THREE.GridHelper(60, 15, 0x333333, 0x333333);
    (grid.material as THREE.LineBasicMaterial).opacity = 0.18;
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    grid.position.y = -6;
    scene.add(grid);

    // Orbit ring lines
    const ringRadii = [6, 10, 14, 18, 22];
    for (const r of ringRadii) {
      const segments = 128;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x444444,
        transparent: true,
        opacity: 0.3,
      });
      scene.add(new THREE.Line(geom, mat));
    }

    const stars = new Map<string, StarMesh>();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const pointerHandler = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets = Array.from(stars.values());
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length) {
        const ev = (hits[0].object as StarMesh).userData.event;
        if (ev) setSelected(ev.id);
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerHandler);

    // ResizeObserver to keep canvas crisp.
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    const orbitRefs: OrbitRefs = {
      renderer,
      scene,
      camera,
      controls,
      raf: 0,
      stars,
      resizeObserver: ro,
      isVisible: true,
      raycaster,
      pointer,
      pointerHandler,
    };
    refsRef.current = orbitRefs;

    // IntersectionObserver gates rendering when off-screen
    const io = new IntersectionObserver(
      ([entry]) => {
        orbitRefs.isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    io.observe(container);

    const tick = (time = 0) => {
      const r = refsRef.current;
      if (!r) return;
      if (r.isVisible) {
        r.stars.forEach((mesh, _id, _map) => {
          let i = 0;
          // angle index ordering is irrelevant for the per-star phase
          i = mesh.userData.trailN;
          const speed = 0.00008 * (1 + i * 0.04);
          const a = mesh.userData.angle + time * speed;
          mesh.userData.currentAngle = a;
          mesh.position.x = Math.cos(a) * mesh.userData.radius;
          mesh.position.z = Math.sin(a) * mesh.userData.radius;
          const trail = mesh.userData.trail;
          if (trail) {
            const N = mesh.userData.trailN;
            const span = mesh.userData.trailSpan;
            const rad = mesh.userData.radius;
            const y = mesh.userData.yJitter;
            const positions = (trail.geometry.attributes.position as THREE.BufferAttribute)
              .array as Float32Array;
            for (let k = 0; k < N; k += 1) {
              const lagAngle = a - (k / (N - 1)) * span;
              positions[k * 3] = Math.cos(lagAngle) * rad;
              positions[k * 3 + 1] = y;
              positions[k * 3 + 2] = Math.sin(lagAngle) * rad;
            }
            trail.geometry.attributes.position.needsUpdate = true;
          }
        });
        r.controls.update();
        r.renderer.render(r.scene, r.camera);
      }
      r.raf = requestAnimationFrame(tick);
    };
    orbitRefs.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(orbitRefs.raf);
      io.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerHandler);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      refsRef.current = null;
    };
  }, [setSelected]);

  // Diff stars on filter change. Add new ones, remove ones that left.
  useEffect(() => {
    const r = refsRef.current;
    if (!r) return;
    const desired = new Set(topEvents.map((e) => e.id));

    // Remove stars that are no longer wanted
    for (const [id, mesh] of r.stars) {
      if (!desired.has(id)) {
        if (mesh.userData.halo) {
          r.scene.remove(mesh.userData.halo);
          mesh.userData.halo.geometry.dispose();
          (mesh.userData.halo.material as THREE.Material).dispose();
        }
        if (mesh.userData.trail) {
          r.scene.remove(mesh.userData.trail);
          mesh.userData.trail.geometry.dispose();
          (mesh.userData.trail.material as THREE.Material).dispose();
        }
        r.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        r.stars.delete(id);
      }
    }

    // Add/update stars
    if (topEvents.length === 0) return;
    const engagementValues = topEvents.map((e) => eventInteractions(e));
    const eMin = d3.min(engagementValues) || 0;
    const eMax = d3.max(engagementValues) || 1;
    const radiusScale = d3.scaleSqrt().domain([eMin, eMax]).range([5.5, 22]);
    const sizeScale = d3.scaleSqrt().domain([eMin, eMax]).range([0.35, 1.4]);

    topEvents.forEach((event, i) => {
      const engagement = eventInteractions(event);
      const radius = radiusScale(engagement);
      const angle =
        (i / topEvents.length) * Math.PI * 2 +
        (event.label === "fake" ? 0.08 : 0);
      const yJitter = ((i % 3) - 1) * 1.2;
      const size = sizeScale(engagement);

      let mesh = r.stars.get(event.id);
      if (!mesh) {
        const color = new THREE.Color(labelColor(event.label));
        const geom = new THREE.SphereGeometry(size, 24, 24);
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1,
        });
        const newMesh = new THREE.Mesh(geom, mat) as unknown as StarMesh;
        newMesh.userData = {
          event,
          angle,
          radius,
          yJitter,
          baseColor: color,
          size,
          trailSpan: 0,
          trailN: TRAIL_N,
          currentAngle: angle,
        };
        newMesh.position.set(
          Math.cos(angle) * radius,
          yJitter,
          Math.sin(angle) * radius
        );
        r.scene.add(newMesh);

        // Halo disc (open-ended cylinder)
        const likeThickness = Math.max(
          0.05,
          Math.min(1.2, Math.log10((event.likeCount ?? 0) + 1) * 0.15)
        );
        const discGeom = new THREE.CylinderGeometry(
          size * 1.5,
          size * 1.5,
          likeThickness,
          48,
          1,
          true
        );
        const discMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
        });
        const halo = new THREE.Mesh(discGeom, discMat);
        halo.rotation.x = Math.PI / 2;
        newMesh.add(halo);
        newMesh.userData.halo = halo;
        newMesh.userData.haloBaseOpacity = 0.28;

        // Comet trail
        const asymmetry = Math.abs(
          (event.commentCount ?? 0) - (event.repostCount ?? 0)
        );
        const trailSpan = 0.05 + Math.max(0, Math.min(0.25, asymmetry / 200));
        const trailGeom = new THREE.BufferGeometry();
        trailGeom.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            new Array(TRAIL_N * 3).fill(0),
            3
          )
        );
        const trailMat = new THREE.LineBasicMaterial({
          color: COLORS.muted,
          transparent: true,
          opacity: 0.42,
        });
        const trail = new THREE.Line(trailGeom, trailMat);
        r.scene.add(trail);
        newMesh.userData.trail = trail;
        newMesh.userData.trailSpan = trailSpan;
        r.stars.set(event.id, newMesh);
        mesh = newMesh;
      } else {
        // Update animation parameters in case engagement / order changed
        mesh.userData.angle = angle;
        mesh.userData.radius = radius;
        mesh.userData.yJitter = yJitter;
      }
    });
  }, [topEvents]);

  // selectedId — imperative highlight on the meshes.
  useEffect(() => {
    const r = refsRef.current;
    if (!r) return;
    const HOT = new THREE.Color(COLORS.hot);
    r.stars.forEach((mesh) => {
      const isSelected = mesh.userData.event.id === selectedId;
      mesh.scale.setScalar(isSelected ? 1.6 : 1);
      const halo = mesh.userData.halo;
      if (halo) {
        const base = mesh.userData.haloBaseOpacity ?? 0.28;
        const mat = halo.material as THREE.MeshBasicMaterial;
        mat.opacity = isSelected ? Math.min(0.85, base + 0.4) : base;
        mat.color.copy(isSelected ? HOT : mesh.userData.baseColor);
      }
      (mesh.material as THREE.MeshStandardMaterial).color.copy(
        isSelected ? HOT : mesh.userData.baseColor
      );
    });
  }, [selectedId]);

  // Auto-rotate toggle propagates to controls without re-render of scene.
  useEffect(() => {
    const r = refsRef.current;
    if (!r) return;
    r.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  if (!data) {
    return (
      <div className="h-full w-full bg-card/30 border border-border/30 animate-pulse" />
    );
  }

  return (
    <div className="relative h-full w-full" data-lenis-prevent>
      <div ref={containerRef} className="absolute inset-0" />
      {!topEvents.length && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            No microblogs under current filter.
          </span>
        </div>
      )}
      <div className="absolute left-3 top-3 grid gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70 max-w-[60%] pointer-events-none">
        <span>Stars · top microblogs</span>
        <span>Radius · engagement</span>
        <span className="hidden md:inline">Disc · log(likes) · Trail · |Δ c−r|</span>
      </div>
      <label className="absolute right-3 top-3 flex items-center gap-2 border border-border bg-card/70 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground cursor-pointer hover:text-foreground backdrop-blur-sm">
        <input
          type="checkbox"
          className="h-3 w-3 accent-[var(--accent)]"
          checked={autoRotate}
          onChange={(e) => setAutoRotate(e.target.checked)}
        />
        Auto rotate
      </label>
    </div>
  );
}
