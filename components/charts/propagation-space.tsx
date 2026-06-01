"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { COLORS } from "@/lib/charts/colors";
import type { EdgeType, GraphEdge, GraphNode, GraphShard } from "@/lib/charts/types";
import { actorLabelName, compactFmt, escapeHTML, fmt, labelName } from "@/lib/format";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";

interface PropagationSpaceProps {
  shard: GraphShard;
}

type NodeGroup = "event" | "bot" | "suspect" | "human" | "unknown";

interface SpaceNode extends GraphNode {
  degree: number;
  group: NodeGroup;
  risk: number;
  influence: number;
  major: boolean;
  distance: number;
  radius: number;
  position: THREE.Vector3;
  color: THREE.Color;
}

interface SpaceEdge extends GraphEdge {
  sourceNode: SpaceNode;
  targetNode: SpaceNode;
  displaySourceNode: SpaceNode;
  displayTargetNode: SpaceNode;
  directTopic: boolean;
  pairCount: number;
  strength: number;
  width: number;
  strong: boolean;
  pulseSpeed: number;
  phase: number;
}

interface PreparedSpace {
  nodes: SpaceNode[];
  edges: SpaceEdge[];
  nodeById: Map<string, SpaceNode>;
  edgeCounts: Record<EdgeType, number>;
  roots: SpaceNode[];
  topActors: SpaceNode[];
  strongEdges: SpaceEdge[];
  weakEdges: SpaceEdge[];
  pulseEdges: SpaceEdge[];
  maxDegree: number;
  maxInfluence: number;
}

interface NodeMesh extends THREE.Mesh {
  userData: {
    node: SpaceNode;
    baseScale: number;
    baseColor: THREE.Color;
  };
}

interface SpaceRuntime {
  reset: () => void;
  select: (id: string | null) => void;
}

interface StrongLine extends Line2 {
  userData: {
    edge: SpaceEdge;
    material: LineMaterial;
    geometry: LineGeometry;
  };
}

const EDGE_ORDER: EdgeType[] = ["repost", "comment", "attitude", "repostCascade", "commentReply"];
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PULSE_INSTANCE_LIMIT = 360;

export function PropagationSpace({ shard }: PropagationSpaceProps) {
  const prepared = useMemo(() => prepareSpace(shard), [shard]);
  const [fullscreen, setFullscreen] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const selectedActorId = useDashboardStore((s) => s.selectedActorId);
  const selectedNodeId = selectedActorId ?? (selectedId ? `m:${selectedId}` : null);
  const selectedNode = selectedNodeId ? prepared.nodeById.get(selectedNodeId) : null;
  const visiblePulseCount = selectedNode?.kind === "actor"
    ? pulseEdgesForNode(prepared, selectedNode.id).length
    : prepared.pulseEdges.length;

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const frame = (expanded: boolean) => (
    <div
      className={[
        "relative h-full w-full overflow-hidden border border-border/30 bg-[#070707]",
        expanded ? "min-h-[100dvh] border-0" : "",
      ].join(" ")}
      data-lenis-prevent
    >
      <SpaceStage
        key={expanded ? "expanded" : "inline"}
        prepared={prepared}
        resetSignal={resetSignal}
        selectedNodeId={selectedNodeId}
        expanded={expanded}
      />
      <div className="pointer-events-none absolute left-3 top-3 border border-border/50 bg-card/75 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-muted-foreground backdrop-blur-sm">
        <span className="text-accent">{fmt.format(prepared.nodes.length)}</span> 3D 节点 ·{" "}
        <span className="text-accent">{fmt.format(prepared.strongEdges.length)}</span> 强边 ·{" "}
        <span className="text-accent">{fmt.format(visiblePulseCount)}</span> 流光边 ·{" "}
        <span className="text-accent">{fmt.format(prepared.edges.length)}</span> 原始边 ·{" "}
        <span className="text-accent">{fmt.format(prepared.topActors.length)}</span> 枢纽候选
      </div>
      <div className="absolute right-3 top-3 flex gap-2">
        <button
          type="button"
          onClick={() => setResetSignal((value) => value + 1)}
          className="inline-flex h-9 items-center gap-2 border border-border/50 bg-card/80 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition hover:border-accent/70 hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          复位
        </button>
        <button
          type="button"
          onClick={() => setFullscreen(!fullscreen)}
          className="inline-flex h-9 items-center gap-2 border border-accent/60 bg-background/85 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition hover:bg-accent hover:text-background"
        >
          {expanded ? <Minimize2 className="size-3.5" aria-hidden="true" /> : <Maximize2 className="size-3.5" aria-hidden="true" />}
          {expanded ? "退出全屏" : "全屏 3D"}
        </button>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <div className="border border-border/45 bg-card/75 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
          默认显示大 V 与强关联骨架；滚轮靠近后普通用户淡入，用户间扩散边的流光表示传播方向。
        </div>
        {selectedNode && (
          <div className="border border-accent/60 bg-background/80 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-foreground backdrop-blur-sm">
            当前节点 <span className="text-accent">{selectedNode.name ?? selectedNode.id}</span> · 度数{" "}
            {compactFmt.format(selectedNode.degree)}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {frame(false)}
      {fullscreen && (
        <div className="fixed inset-0 z-[90] bg-background">
          {frame(true)}
        </div>
      )}
    </>
  );
}

function SpaceStage({
  prepared,
  selectedNodeId,
  resetSignal,
  expanded,
}: {
  prepared: PreparedSpace;
  selectedNodeId: string | null;
  resetSignal: number;
  expanded: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SpaceRuntime | null>(null);
  const selectedRef = useRef<string | null>(selectedNodeId);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const setSelectedActor = useDashboardStore((s) => s.setSelectedActor);
  const { show, hide } = useTooltip();

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    runtimeRef.current?.select(selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    runtimeRef.current?.reset();
  }, [resetSignal]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const host = container;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, expanded ? 0.010 : 0.015);
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 320);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.panSpeed = 0.75;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.95;
    controls.minDistance = 5;
    controls.maxDistance = expanded ? 92 : 66;

    scene.add(new THREE.AmbientLight(0xffffff, 0.48));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(12, 16, 10);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x6f9fd8, 0.25);
    fillLight.position.set(-10, 4, -8);
    scene.add(fillLight);
    const hotLight = new THREE.PointLight(0xe96a2c, 1.8, 52);
    hotLight.position.set(0, 7, 10);
    scene.add(hotLight);

    const graphGroup = new THREE.Group();
    scene.add(graphGroup);
    addRiskPlanes(graphGroup);

    // Ambient floating particles
    const particleCount = 320;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleOpacities = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 100;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 70;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
      particleOpacities[i] = 0.12 + Math.random() * 0.28;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 0.28,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.renderOrder = -10;
    scene.add(particles);

    function createGlowTexture() {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
      gradient.addColorStop(0.6, "rgba(255,255,255,0.1)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }
    const glowTexture = createGlowTexture();

    const actorGeometry = new THREE.SphereGeometry(1, 20, 16);
    const eventGeometry = new THREE.IcosahedronGeometry(1, 1);
    const nodeMeshes = new Map<string, NodeMesh>();
    const pickTargets: NodeMesh[] = [];

    for (const node of prepared.nodes) {
      const material = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: node.group === "bot" || node.group === "suspect" ? 0.72 : 0.28,
        roughness: 0.32,
        metalness: 0.18,
        transparent: true,
        opacity: node.major ? (node.kind === "microblog" ? 1 : 0.88) : 0.035,
      });
      const mesh = new THREE.Mesh(node.kind === "microblog" ? eventGeometry : actorGeometry, material) as unknown as NodeMesh;
      mesh.position.copy(node.position);
      const baseScale = node.kind === "microblog" ? node.radius * 1.25 : node.radius;
      mesh.scale.setScalar(baseScale);
      mesh.userData = {
        node,
        baseScale,
        baseColor: node.color.clone(),
      };
      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: node.color,
        transparent: true,
        opacity: node.major ? (node.group === "bot" || node.group === "suspect" ? 0.55 : 0.38) : 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowSprite = new THREE.Sprite(glowMaterial);
      glowSprite.scale.setScalar(baseScale * (node.major ? 5.5 : 3.8));
      mesh.add(glowSprite);
      graphGroup.add(mesh);
      nodeMeshes.set(node.id, mesh);
      pickTargets.push(mesh);
    }

    const edgePositions = new Float32Array(prepared.weakEdges.length * 6);
    const edgeColors = new Float32Array(prepared.weakEdges.length * 6);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3).setUsage(THREE.DynamicDrawUsage));
    edgeGeometry.setAttribute("color", new THREE.BufferAttribute(edgeColors, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    graphGroup.add(edgeLines);

    const strongLines: StrongLine[] = [];
    for (const edge of prepared.strongEdges) {
      const geometry = new LineGeometry();
      const source = edge.displaySourceNode.position;
      const target = edge.displayTargetNode.position;
      const distance = source.distanceTo(target);
      const bend = Math.min(3.5, distance * 0.22) * (edge.sourceNode.id < edge.targetNode.id ? 1 : -1);
      const control = quadraticBezierControl(source, target, bend);
      const positions = sampleQuadraticBezier(source, control, target, 8);
      const colors = sampleQuadraticBezierColors(
        edge.displaySourceNode.color,
        edge.displayTargetNode.color,
        8,
      );
      geometry.setPositions(positions);
      geometry.setColors(colors);
      const material = new LineMaterial({
        linewidth: edge.width,
        vertexColors: true,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        resolution: new THREE.Vector2(1, 1),
      });
      const line = new Line2(geometry, material) as unknown as StrongLine;
      line.computeLineDistances();
      line.userData = { edge, material, geometry };
      graphGroup.add(line);
      strongLines.push(line);
    }

    const pulseDummy = new THREE.Object3D();
    const pulseColor = new THREE.Color();
    const pulseGeometry = new THREE.SphereGeometry(1, 8, 6);
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.ink,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const pulseCapacity = Math.max(
      1,
      Math.min(PULSE_INSTANCE_LIMIT, prepared.edges.filter((edge) => !edge.directTopic).length),
    );
    const pulses = new THREE.InstancedMesh(pulseGeometry, pulseMaterial, pulseCapacity);
    pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pulses.renderOrder = 20;
    graphGroup.add(pulses);
    let activePulseEdges = resolvePulseEdges(prepared, selectedRef.current);
    pulses.count = activePulseEdges.length;

    let selectedGeometry = new THREE.BufferGeometry();
    const selectedMaterial = new THREE.LineBasicMaterial({
      color: COLORS.hot,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const selectedLines = new THREE.LineSegments(selectedGeometry, selectedMaterial);
    graphGroup.add(selectedLines);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.2 };
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    const cameraNormal = new THREE.Vector3();
    let hovered: NodeMesh | null = null;
    let dragging: NodeMesh | null = null;
    let pointerDown = { x: 0, y: 0, moved: false };
    let disposed = false;
    let visible = true;
    let raf = 0;

    function resize() {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      for (const line of strongLines) {
        line.userData.material.resolution.set(width, height);
      }
    }

    function resetCamera() {
      const distance = expanded ? 58 : 46;
      camera.position.set(0, 12, distance);
      controls.target.set(0, 0, 0);
      controls.update();
    }

    function updatePointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    }

    function updateEdges() {
      for (let i = 0; i < prepared.weakEdges.length; i += 1) {
        const edge = prepared.weakEdges[i];
        const source = edge.displaySourceNode.position;
        const target = edge.displayTargetNode.position;
        const p = i * 6;
        edgePositions[p] = source.x;
        edgePositions[p + 1] = source.y;
        edgePositions[p + 2] = source.z;
        edgePositions[p + 3] = target.x;
        edgePositions[p + 4] = target.y;
        edgePositions[p + 5] = target.z;
        edgeColors[p] = edge.displaySourceNode.color.r;
        edgeColors[p + 1] = edge.displaySourceNode.color.g;
        edgeColors[p + 2] = edge.displaySourceNode.color.b;
        edgeColors[p + 3] = edge.displayTargetNode.color.r;
        edgeColors[p + 4] = edge.displayTargetNode.color.g;
        edgeColors[p + 5] = edge.displayTargetNode.color.b;
      }
      (edgeGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (edgeGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      for (const line of strongLines) {
        const edge = line.userData.edge;
        const source = edge.displaySourceNode.position;
        const target = edge.displayTargetNode.position;
        const distance = source.distanceTo(target);
        const bend = Math.min(3.5, distance * 0.22) * (edge.sourceNode.id < edge.targetNode.id ? 1 : -1);
        const control = quadraticBezierControl(source, target, bend);
        line.userData.geometry.setPositions(sampleQuadraticBezier(source, control, target, 8));
        line.userData.geometry.setColors(
          sampleQuadraticBezierColors(edge.displaySourceNode.color, edge.displayTargetNode.color, 8),
        );
        line.computeLineDistances();
      }
      refreshSelection(selectedRef.current);
    }

    function refreshSelection(id: string | null) {
      for (const mesh of nodeMeshes.values()) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const glowSprite = mesh.children.find((c) => c instanceof THREE.Sprite) as THREE.Sprite | undefined;
        const glowMaterial = glowSprite?.material as THREE.SpriteMaterial | undefined;
        const selectedNode = selectedRef.current ? prepared.nodeById.get(selectedRef.current) : null;
        const expandNeighborhood = selectedNode?.kind === "actor";
        const direct = id === mesh.userData.node.id;
        const connected = expandNeighborhood && id ? isNeighbor(prepared, id, mesh.userData.node.id) : false;
        const baseOpacity = mesh.userData.node.major ? (mesh.userData.node.kind === "microblog" ? 1 : 0.88) : 0.035;
        material.opacity = !id || direct || connected ? baseOpacity : 0.16;
        material.emissiveIntensity = direct ? 1.6 : connected ? 0.65 : mesh.userData.node.risk > 0.55 ? 0.45 : 0.18;
        mesh.scale.setScalar(mesh.userData.baseScale * (direct ? 1.85 : connected ? 1.22 : 1));
        if (glowMaterial && glowSprite) {
          const glowOpacity = direct ? 0.85 : connected ? 0.6 : mesh.userData.node.major ? (mesh.userData.node.risk > 0.55 ? 0.5 : 0.35) : 0.1;
          glowMaterial.opacity = !id || direct || connected ? glowOpacity : glowOpacity * 0.25;
          glowSprite.scale.setScalar(mesh.userData.baseScale * (direct ? 8 : connected ? 5.5 : mesh.userData.node.major ? 5 : 3.5));
        }
      }
      activePulseEdges = resolvePulseEdges(prepared, id);
      pulses.count = activePulseEdges.length;

      selectedGeometry.dispose();
      if (!id) {
        selectedGeometry = new THREE.BufferGeometry();
        selectedLines.geometry = selectedGeometry;
        return;
      }
      const selectedEdges = prepared.edges.filter((edge) => edge.source === id || edge.target === id);
      const selectedPositions = new Float32Array(selectedEdges.length * 6);
      for (let i = 0; i < selectedEdges.length; i += 1) {
        const edge = selectedEdges[i];
        const source = edge.displaySourceNode.position;
        const target = edge.displayTargetNode.position;
        const p = i * 6;
        selectedPositions[p] = source.x;
        selectedPositions[p + 1] = source.y;
        selectedPositions[p + 2] = source.z;
        selectedPositions[p + 3] = target.x;
        selectedPositions[p + 4] = target.y;
        selectedPositions[p + 5] = target.z;
      }
      selectedGeometry = new THREE.BufferGeometry();
      selectedGeometry.setAttribute("position", new THREE.BufferAttribute(selectedPositions, 3));
      selectedLines.geometry = selectedGeometry;
    }

    function updateVisibility(time: number) {
      const distance = camera.position.distanceTo(controls.target);
      const zoomReveal = smoothstep(44, 19, distance);
      for (const mesh of nodeMeshes.values()) {
        const node = mesh.userData.node;
        const material = mesh.material as THREE.MeshStandardMaterial;
        const glowSprite = mesh.children.find((c) => c instanceof THREE.Sprite) as THREE.Sprite | undefined;
        const glowMaterial = glowSprite?.material as THREE.SpriteMaterial | undefined;
        const selectedNode = selectedRef.current ? prepared.nodeById.get(selectedRef.current) : null;
        const expandNeighborhood = selectedNode?.kind === "actor";
        const direct = selectedRef.current === node.id;
        const connected = expandNeighborhood && selectedRef.current ? isNeighbor(prepared, selectedRef.current, node.id) : false;
        const localReveal = smoothstep(24, 8, node.position.distanceTo(controls.target));
        const reveal = clamp(zoomReveal * (0.35 + localReveal * 0.9), 0, 1);
        const baseOpacity = node.major ? (node.kind === "microblog" ? 1 : 0.9) : 0.025 + reveal * 0.78;
        material.opacity = direct || connected ? 0.95 : clamp(baseOpacity, 0.02, node.kind === "microblog" ? 1 : 0.92);
        mesh.visible = node.major || direct || connected || material.opacity > 0.08;
        if (glowMaterial && glowSprite) {
          const glowBase = node.major ? (node.risk > 0.55 ? 0.5 : 0.35) : 0.08 + reveal * 0.28;
          glowMaterial.opacity = direct || connected ? 0.75 : clamp(glowBase, 0.02, 0.65);
          glowSprite.visible = mesh.visible;
        }
      }
      edgeMaterial.opacity = 0.018 + zoomReveal * 0.105;
      for (const line of strongLines) {
        const edge = line.userData.edge;
        const selectedNode = selectedRef.current ? prepared.nodeById.get(selectedRef.current) : null;
        const expandNeighborhood = selectedNode?.kind === "actor";
        const active =
          !selectedRef.current ||
          edge.source === selectedRef.current ||
          edge.target === selectedRef.current ||
          (expandNeighborhood &&
            (isNeighbor(prepared, selectedRef.current, edge.source) ||
              isNeighbor(prepared, selectedRef.current, edge.target)));
        line.userData.material.opacity = active ? 0.28 + zoomReveal * 0.12 : 0.08;
      }
      updatePulses(time);
    }

    function updatePulses(time: number) {
      for (let i = 0; i < activePulseEdges.length; i += 1) {
        const edge = activePulseEdges[i];
        const source = edge.displaySourceNode.position;
        const target = edge.displayTargetNode.position;
        const u = (time * edge.pulseSpeed + edge.phase) % 1;
        pulseDummy.position.lerpVectors(source, target, u);
        pulseDummy.scale.setScalar(0.08 + Math.min(0.22, edge.width * 0.045));
        pulseDummy.updateMatrix();
        pulses.setMatrixAt(i, pulseDummy.matrix);
        pulseColor.lerpColors(edge.displaySourceNode.color, edge.displayTargetNode.color, u);
        pulses.setColorAt(i, pulseColor);
      }
      pulses.instanceMatrix.needsUpdate = true;
      if (pulses.instanceColor) pulses.instanceColor.needsUpdate = true;
    }

    function pickNode(event: PointerEvent) {
      updatePointer(event);
      const hits = raycaster.intersectObjects(pickTargets, false);
      return (hits[0]?.object as NodeMesh | undefined) ?? null;
    }

    function commitSelection(mesh: NodeMesh | null) {
      if (!mesh) return;
      const node = mesh.userData.node;
      controls.target.copy(node.position);
      if (node.kind === "microblog") {
        setSelectedActor(null);
        setSelected(node.id.replace(/^m:/, ""));
      } else {
        setSelectedActor(node.id);
      }
    }

    function onPointerDown(event: PointerEvent) {
      const mesh = pickNode(event);
      pointerDown = { x: event.clientX, y: event.clientY, moved: false };
      if (!mesh) return;
      event.preventDefault();
      renderer.domElement.setPointerCapture(event.pointerId);
      dragging = mesh;
      hovered = mesh;
      controls.enabled = false;
      camera.getWorldDirection(cameraNormal);
      dragPlane.setFromNormalAndCoplanarPoint(cameraNormal, mesh.position);
      raycaster.ray.intersectPlane(dragPlane, dragPoint);
      dragOffset.copy(dragPoint).sub(mesh.position);
      commitSelection(mesh);
    }

    function onPointerMove(event: PointerEvent) {
      if (dragging) {
        pointerDown.moved =
          pointerDown.moved ||
          Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 3;
        updatePointer(event);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          const next = dragPoint.sub(dragOffset);
          dragging.position.copy(next);
          dragging.userData.node.position.copy(next);
          updateEdges();
        }
        renderer.domElement.style.cursor = "grabbing";
        return;
      }

      const mesh = pickNode(event);
      if (mesh !== hovered) {
        hovered = mesh;
        if (mesh) show(event, tooltipFor(mesh.userData.node, prepared));
        else hide();
      } else if (mesh) {
        show(event, tooltipFor(mesh.userData.node, prepared));
      }
      renderer.domElement.style.cursor = mesh ? "grab" : "move";
    }

    function onPointerUp(event: PointerEvent) {
      if (dragging) {
        renderer.domElement.releasePointerCapture(event.pointerId);
        if (!pointerDown.moved) commitSelection(dragging);
      }
      dragging = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = hovered ? "grab" : "move";
    }

    function onPointerLeave() {
      if (!dragging) {
        hovered = null;
        hide();
        renderer.domElement.style.cursor = "move";
      }
    }

    function tick(time: number) {
      if (disposed) return;
      if (visible) {
        controls.update();
        const pulse = 1 + Math.sin(time * 0.0024) * 0.04;
        for (const root of prepared.roots) {
          const mesh = nodeMeshes.get(root.id);
          if (mesh && selectedRef.current !== root.id) mesh.scale.setScalar(mesh.userData.baseScale * pulse);
        }
        particles.rotation.y = time * 0.00002;
        particles.rotation.x = Math.sin(time * 0.000008) * 0.08;
        updateVisibility(time);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(tick);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);

    resize();
    resetCamera();
    updateEdges();
    refreshSelection(selectedRef.current);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    raf = requestAnimationFrame(tick);

    runtimeRef.current = {
      reset: resetCamera,
      select: (id) => {
        selectedRef.current = id;
        refreshSelection(id);
      },
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      hide();
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [expanded, hide, prepared, setSelected, setSelectedActor, show]);

  return <div ref={containerRef} className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(233,106,44,0.12),rgba(7,7,7,0.12)_34%,rgba(5,5,5,0.96)_78%)]" />;
}

function prepareSpace(shard: GraphShard): PreparedSpace {
  const degree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const pairCounts = new Map<string, number>();
  const edgeCounts = Object.fromEntries(EDGE_ORDER.map((type) => [type, 0])) as Record<EdgeType, number>;

  for (const edge of shard.graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    edgeCounts[edge.type] = (edgeCounts[edge.type] ?? 0) + 1;
    pairCounts.set(edgeKey(edge), (pairCounts.get(edgeKey(edge)) ?? 0) + 1);
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const rootIds = shard.graph.nodes
    .filter((node) => node.kind === "microblog")
    .map((node) => node.id);
  const distance = graphDistances(rootIds, adjacency);
  const maxDegree = Math.max(1, ...shard.graph.nodes.map((node) => degree.get(node.id) ?? 0));
  const influenceById = new Map(
    shard.graph.nodes.map((node) => [node.id, nodeInfluence(node, degree.get(node.id) ?? 0)]),
  );
  const maxInfluence = Math.max(1, ...influenceById.values());
  const actorInfluences = shard.graph.nodes
    .filter((node) => node.kind === "actor")
    .map((node) => influenceById.get(node.id) ?? 0)
    .sort((a, b) => a - b);
  const majorThreshold = quantile(actorInfluences, 0.92);
  const rootsTotal = Math.max(1, rootIds.length);
  let eventIndex = 0;
  let actorIndex = 0;
  const actorTotal = Math.max(1, shard.graph.nodes.filter((node) => node.kind === "actor").length);

  const nodes: SpaceNode[] = shard.graph.nodes
    .map((node) => {
      const nodeDegree = degree.get(node.id) ?? 0;
      const group = nodeGroup(node);
      const risk = nodeRisk(node);
      const influence = influenceById.get(node.id) ?? 0;
      const major =
        node.kind === "microblog" ||
        influence >= majorThreshold ||
        (risk >= 0.85 && nodeDegree >= 6);
      const nodeDistance = distance.get(node.id) ?? 5;
      let position: THREE.Vector3;

      if (node.kind === "microblog") {
        const a = (eventIndex / rootsTotal) * TAU;
        const r = rootIds.length <= 1 ? 0 : 2.2 + eventIndex * 0.22;
        position = new THREE.Vector3(Math.cos(a) * r, Math.sin(eventIndex * 1.7) * 0.35, Math.sin(a) * r);
        eventIndex += 1;
      } else {
        const i = actorIndex;
        const theta = i * GOLDEN_ANGLE + risk * 1.55;
        const layerY = (risk - 0.5) * 19 + (hashUnit(node.id) - 0.5) * 4.8;
        const shell = 13.5 + (1 - risk) * 12.5 + Math.min(5, nodeDistance) * 1.8;
        const flat = Math.sqrt(Math.max(2, shell * shell - layerY * layerY));
        const lane = ((i % 13) - 6) * 0.42;
        position = new THREE.Vector3(Math.cos(theta) * flat, layerY, Math.sin(theta) * flat + lane);
        actorIndex += 1;
      }

      const radius =
        node.kind === "microblog"
          ? Math.max(0.85, Math.min(2.2, 0.9 + Math.sqrt(node.weight || 1) * 0.032))
          : Math.max(
              0.09,
              Math.min(1.1, 0.09 + Math.pow(influence / maxInfluence, 0.58) * 0.95 + risk * 0.12),
            );

      return {
        ...node,
        degree: nodeDegree,
        group,
        risk,
        influence,
        major,
        distance: nodeDistance,
        radius,
        position,
        color: nodeColor(node, group, risk),
      };
    });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const rawEdges: SpaceEdge[] = [];
  for (const edge of shard.graph.edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    const directTopic = sourceNode.kind !== targetNode.kind && (sourceNode.kind === "microblog" || targetNode.kind === "microblog");
    const displaySourceNode = directTopic ? (sourceNode.kind === "microblog" ? sourceNode : targetNode) : sourceNode;
    const displayTargetNode = directTopic ? (sourceNode.kind === "microblog" ? targetNode : sourceNode) : targetNode;
    const pairCount = pairCounts.get(edgeKey(edge)) ?? 1;
    const strength = edgeStrength(edge.type, sourceNode, targetNode, pairCount, directTopic, maxInfluence);
    rawEdges.push({
      ...edge,
      sourceNode,
      targetNode,
      displaySourceNode,
      displayTargetNode,
      directTopic,
      pairCount,
      strength,
      width: 1,
      strong: false,
      pulseSpeed: 0.00012 + hashUnit(`${edge.source}|${edge.target}|${edge.type}`) * 0.00018,
      phase: hashUnit(`${edge.target}|${edge.source}|pulse`),
    });
  }

  const maxStrength = Math.max(1, ...rawEdges.map((edge) => edge.strength));
  const strongBudget = Math.min(Math.max(80, Math.ceil(rawEdges.length * 0.08)), 260);
  const diffusionBudget = Math.min(Math.max(36, Math.ceil(rawEdges.length * 0.055)), 180);
  const diffusionIndexes = new Set(
    rawEdges
      .map((edge, index) => ({ edge, index }))
      .filter((item) => !item.edge.directTopic)
      .sort((a, b) => b.edge.strength - a.edge.strength)
      .slice(0, diffusionBudget)
      .map((item) => item.index),
  );
  const strongIndexes = new Set(
    rawEdges
      .map((edge, index) => ({ edge, index }))
      .sort((a, b) => b.edge.strength - a.edge.strength)
      .slice(0, strongBudget)
      .map((item) => item.index),
  );
  const edges = rawEdges.map((edge, index) => {
    const normalized = Math.pow(edge.strength / maxStrength, 0.58);
    const strong =
      strongIndexes.has(index) ||
      diffusionIndexes.has(index) ||
      edge.pairCount > 1;
    return {
      ...edge,
      width: 1.1 + normalized * 4.8,
      strong,
    };
  });

  const roots = nodes.filter((node) => node.kind === "microblog");
  const topActors = nodes
    .filter((node) => node.kind === "actor")
    .sort((a, b) => b.risk * b.degree - a.risk * a.degree)
    .slice(0, Math.min(24, actorTotal));
  const strongEdges = edges.filter((edge) => edge.strong);
  const weakEdges = edges.filter((edge) => !edge.strong);
  const pulseEdges = edges
    .filter((edge) => !edge.directTopic)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 180);

  return { nodes, edges, nodeById, edgeCounts, roots, topActors, strongEdges, weakEdges, pulseEdges, maxDegree, maxInfluence };
}

function graphDistances(rootIds: string[], adjacency: Map<string, string[]>) {
  const distances = new Map<string, number>();
  const queue: string[] = [];
  for (const id of rootIds) {
    distances.set(id, 0);
    queue.push(id);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const nextDistance = (distances.get(id) ?? 0) + 1;
    if (nextDistance > 6) continue;
    for (const next of adjacency.get(id) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, nextDistance);
      queue.push(next);
    }
  }
  return distances;
}

function edgePositionArray(edge: SpaceEdge) {
  const source = edge.displaySourceNode.position;
  const target = edge.displayTargetNode.position;
  return [source.x, source.y, source.z, target.x, target.y, target.z];
}

function quadraticBezierControl(
  source: THREE.Vector3,
  target: THREE.Vector3,
  bend: number,
): THREE.Vector3 {
  const mid = new THREE.Vector3().addVectors(source, target).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(target, source);
  const perp = new THREE.Vector3(-dir.z, dir.y * 0.3 + 0.1, dir.x).normalize();
  return mid.add(perp.multiplyScalar(bend));
}

function sampleQuadraticBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  segments: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const o = 1 - t;
    const x = o * o * p0.x + 2 * o * t * p1.x + t * t * p2.x;
    const y = o * o * p0.y + 2 * o * t * p1.y + t * t * p2.y;
    const z = o * o * p0.z + 2 * o * t * p1.z + t * t * p2.z;
    out.push(x, y, z);
  }
  return out;
}

function sampleQuadraticBezierColors(
  c0: THREE.Color,
  c1: THREE.Color,
  segments: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const o = 1 - t;
    out.push(o * c0.r + t * c1.r, o * c0.g + t * c1.g, o * c0.b + t * c1.b);
  }
  return out;
}

function edgeKey(edge: Pick<GraphEdge, "source" | "target" | "type">) {
  return `${edge.source}->${edge.target}|${edge.type}`;
}

function nodeInfluence(node: GraphNode, degree: number) {
  const weight = Math.max(1, node.weight ?? 1);
  const socialProxy = Math.sqrt(weight) * 0.42;
  const centralityProxy = Math.sqrt(Math.max(0, degree)) * 1.35 + degree * 0.08;
  const riskBonus = nodeRisk(node) * 1.1;
  return socialProxy + centralityProxy + riskBonus;
}

function edgeStrength(
  type: EdgeType,
  source: SpaceNode,
  target: SpaceNode,
  pairCount: number,
  directTopic: boolean,
  maxInfluence: number,
) {
  const typeBoost =
    type === "repostCascade" ? 2.6 : type === "commentReply" ? 2.2 : type === "repost" ? 1.8 : type === "comment" ? 1.45 : 0.72;
  const trafficProxy = pairCount * 2.8;
  const centralityProxy = ((source.influence + target.influence) / Math.max(1, maxInfluence)) * 7;
  const bridgeBonus = source.major || target.major ? 1.2 : 0;
  return trafficProxy + centralityProxy + typeBoost + bridgeBonus + (directTopic ? 0.6 : 0);
}

function quantile(values: number[], q: number) {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const index = clamp(Math.floor((values.length - 1) * q), 0, values.length - 1);
  return values[index];
}

function addRiskPlanes(group: THREE.Group) {
  const planes = [
    { y: -6.5, color: 0x6f9fd8, opacity: 0.1 },
    { y: 0, color: 0x777777, opacity: 0.08 },
    { y: 6.5, color: 0xe96a2c, opacity: 0.16 },
  ];
  for (const plane of planes) {
    const grid = new THREE.GridHelper(42, 18, plane.color, plane.color);
    const material = grid.material as THREE.LineBasicMaterial;
    material.transparent = true;
    material.opacity = plane.opacity;
    material.depthWrite = false;
    grid.position.y = plane.y;
    group.add(grid);
  }
}

function isNeighbor(space: PreparedSpace, sourceId: string, targetId: string) {
  if (sourceId === targetId) return true;
  return space.edges.some(
    (edge) =>
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.target === sourceId && edge.source === targetId),
  );
}

function resolvePulseEdges(space: PreparedSpace, selectedNodeId: string | null) {
  if (!selectedNodeId) return space.pulseEdges.slice(0, PULSE_INSTANCE_LIMIT);
  const selectedNode = space.nodeById.get(selectedNodeId);
  if (selectedNode?.kind !== "actor") return space.pulseEdges.slice(0, PULSE_INSTANCE_LIMIT);
  return pulseEdgesForNode(space, selectedNodeId).slice(0, PULSE_INSTANCE_LIMIT);
}

function pulseEdgesForNode(space: PreparedSpace, nodeId: string) {
  const direct = space.edges
    .filter((edge) => !edge.directTopic && (edge.source === nodeId || edge.target === nodeId))
    .sort((a, b) => b.strength - a.strength);
  if (direct.length) return direct;
  return space.edges
    .filter(
      (edge) =>
        !edge.directTopic &&
        (isNeighbor(space, nodeId, edge.source) || isNeighbor(space, nodeId, edge.target)),
    )
    .sort((a, b) => b.strength - a.strength);
}

function nodeGroup(node: GraphNode): NodeGroup {
  if (node.kind === "microblog") return "event";
  if (node.botLabel === "bot" || (node.botScore ?? 0) >= 0.75) return "bot";
  if ((node.fakeShare ?? 0) >= 0.5 || (node.botScore ?? 0) >= 0.5) return "suspect";
  if (node.botLabel === "human") return "human";
  return "unknown";
}

function nodeRisk(node: GraphNode) {
  if (node.kind === "microblog") return node.label === "fake" ? 1 : 0.18;
  const inferred =
    node.botLabel === "bot" ? 0.9 : node.botLabel === "human" ? 0.08 : 0.32;
  return clamp(Math.max(node.fakeShare ?? 0, node.botScore ?? 0, node.botShare ?? 0, inferred), 0, 1);
}

function nodeColor(node: GraphNode, group: NodeGroup, risk: number) {
  if (node.kind === "microblog") return new THREE.Color(node.label === "fake" ? COLORS.hot : COLORS.ink);
  if (group === "bot") return new THREE.Color(COLORS.hot);
  if (group === "suspect") return new THREE.Color("#f4a261");
  if (group === "human") return new THREE.Color(COLORS.cool);
  return new THREE.Color(risk > 0.4 ? "#b08a64" : "#8b8b8b");
}

function edgeColor(type: EdgeType) {
  if (type === "comment" || type === "commentReply") return new THREE.Color(COLORS.cool);
  if (type === "repost" || type === "repostCascade") return new THREE.Color(COLORS.hot);
  return new THREE.Color("#7d7167");
}

function tooltipFor(node: SpaceNode, space: PreparedSpace): string {
  const kind = node.kind === "microblog" ? "微博事件" : "参与者";
  const botPct = Math.round((node.botShare ?? node.botScore ?? node.risk) * 100);
  const fakePct = Math.round((node.fakeShare ?? (node.kind === "microblog" && node.label === "fake" ? 1 : 0)) * 100);
  return `<b>${escapeHTML(node.name ?? node.id)}</b>
    <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">类型</span><b>${escapeHTML(kind)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">标签</span><b>${node.kind === "microblog" ? labelName(node.label ?? "all") : actorLabelName(node.botLabel)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">度数</span><b>${fmt.format(node.degree)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">层级距离</span><b>${fmt.format(Math.max(0, node.distance))}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">水军代理</span><b>${botPct}%</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">虚假参与</span><b>${fakePct}%</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">全图节点</span><b>${fmt.format(space.nodes.length)}</b></div>`;
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function smoothstep(from: number, to: number, value: number) {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
