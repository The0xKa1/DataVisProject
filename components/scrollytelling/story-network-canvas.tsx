"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { COLORS } from "@/lib/charts/colors";
import { resolveStoryNetwork } from "@/lib/charts/story-network";
import type { StoryNetwork, StoryNetworkNode, StoryNetworkEdge } from "@/lib/charts/types";
import { escapeHTML, labelName } from "@/lib/format";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";

interface Viewport {
  centerX: number;
  centerY: number;
  scale: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface FlowEdge {
  edge: StoryNetworkEdge;
  source: StoryNetworkNode;
  target: StoryNetworkNode;
  phase: number;
  speed: number;
}

const FLOW_EDGE_CAP = 190;

export function StoryNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentViewRef = useRef<Viewport>({ centerX: 0, centerY: 0, scale: 0 });
  const hoveredRef = useRef<StoryNetworkNode | null>(null);

  const data = useDashboardStore((s) => s.data);
  const activeStoryPresetId = useDashboardStore((s) => s.activeStoryPresetId);
  const storyViewport = useDashboardStore((s) => s.storyViewport);
  const highlightNodeIds = useDashboardStore((s) => s.highlightNodeIds);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const { show, hide } = useTooltip();

  const story = useMemo(() => resolveStoryNetwork(data), [data]);
  const focus = useMemo(
    () =>
      story?.focusRegions.find((region) => region.id === activeStoryPresetId) ??
      story?.focusRegions[0] ??
      null,
    [story, activeStoryPresetId],
  );

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const context = canvasEl?.getContext("2d");
    const storyData = story;
    if (!canvasEl || !context || !storyData) return;
    const canvas = canvasEl;
    const ctx = context;
    const network: StoryNetwork = storyData;

    let frame = 0;
    let running = false;
    let visible = true;
    let disposed = false;
    let width = 1;
    let height = 1;
    let dpr = 1;
    const startTime = performance.now();

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
    const highlighted = new Set(highlightNodeIds.length ? highlightNodeIds : focus?.nodeIds ?? []);
    const selectedStoryIds = new Set(
      selectedId ? network.nodes.filter((node) => node.eventId === selectedId).map((node) => node.id) : [],
    );
    const isOverview = highlighted.size >= network.nodes.length * 0.6;

    // Per-node deterministic phase so breathing/halos stagger instead of pulsing in unison.
    const phaseById = new Map<string, number>();
    for (const node of network.nodes) phaseById.set(node.id, hashUnit(node.id) * Math.PI * 2);

    // Bounded set of edges that carry traveling "propagation" particles. In the
    // overview we sample repost cascades; inside a preset we follow the active set.
    const flowEdges: FlowEdge[] = [];
    for (const edge of network.edges) {
      if (flowEdges.length >= FLOW_EDGE_CAP) break;
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const active = highlighted.has(edge.source) || highlighted.has(edge.target);
      const include = isOverview
        ? edge.type === "repost" || edge.type === "repostCascade"
        : active;
      if (!include) continue;
      flowEdges.push({
        edge,
        source,
        target,
        phase: hashUnit(`${edge.source}|${edge.target}|${edge.type}`),
        speed: 0.085 + hashUnit(`${edge.target}|${edge.source}`) * 0.05,
      });
    }

    const glowHot = makeGlowSprite(233, 106, 44);
    const glowCool = makeGlowSprite(111, 159, 216);
    const glowInk = makeGlowSprite(237, 237, 237);
    const glowFor = (node: StoryNetworkNode) =>
      node.label === "fake" ? glowHot : node.kind === "microblog" ? glowInk : glowCool;

    const quadtree = d3
      .quadtree<StoryNetworkNode>()
      .x((node) => node.x)
      .y((node) => node.y)
      .addAll(network.nodes);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      ensureFrame();
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function targetView(): Viewport {
      const bounds = network.bounds;
      const boundsW = Math.max(1, bounds.maxX - bounds.minX);
      const boundsH = Math.max(1, bounds.maxY - bounds.minY);
      const fitScale = Math.min(width / boundsW, height / boundsH) * 0.78;
      const semantic = storyViewport ?? focus ?? {
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2,
        scale: 1,
      };
      return {
        centerX: semantic.centerX,
        centerY: semantic.centerY,
        scale: fitScale * semantic.scale,
      };
    }

    function project(node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport): ScreenPoint {
      return {
        x: (node.x - view.centerX) * view.scale + width / 2,
        y: (node.y - view.centerY) * view.scale + height / 2,
      };
    }

    function invert(clientX: number, clientY: number, view: Viewport) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return {
        x: (x - width / 2) / view.scale + view.centerX,
        y: (y - height / 2) / view.scale + view.centerY,
      };
    }

    function draw(view: Viewport, time: number) {
      ctx.clearRect(0, 0, width, height);
      drawBackdrop(ctx, width, height, view, time, reduceMotion);
      drawEdges(ctx, network, nodeById, highlighted, selectedStoryIds, view, project, width, height);
      if (!reduceMotion) drawFlow(ctx, flowEdges, glowHot, view, project, width, height, time);
      drawNodeGlow(ctx, network, highlighted, selectedStoryIds, glowFor, phaseById, view, project, width, height, time, reduceMotion);
      drawNodeCores(ctx, network, highlighted, selectedStoryIds, hoveredRef.current?.id ?? null, view, project, width, height);
      drawPulses(ctx, network, highlighted, selectedStoryIds, phaseById, view, project, width, height, time, reduceMotion);
      drawHoverLabels(ctx, network, selectedStoryIds, hoveredRef.current?.id ?? null, view, project, width, height);
      drawRegionLabel(ctx, focus?.label ?? "Story network", network.selectionRule, width, height);
    }

    function step(now: number) {
      if (disposed) return;
      const time = (now - startTime) / 1000;
      const target = targetView();
      const current = currentViewRef.current.scale > 0 ? currentViewRef.current : target;
      const next: Viewport = {
        centerX: lerp(current.centerX, target.centerX, 0.095),
        centerY: lerp(current.centerY, target.centerY, 0.095),
        scale: lerp(current.scale, target.scale, 0.095),
      };
      currentViewRef.current = next;
      draw(next, time);

      const moving =
        Math.abs(next.centerX - target.centerX) > 0.8 ||
        Math.abs(next.centerY - target.centerY) > 0.8 ||
        Math.abs(next.scale - target.scale) > 0.002;

      // Ambient mode keeps animating (glow / flow / breathing). Reduced-motion
      // only runs the loop until the camera settles, then idles.
      if (visible && (reduceMotion ? moving : true)) {
        frame = requestAnimationFrame(step);
      } else {
        running = false;
      }
    }

    function start() {
      if (running || disposed) return;
      running = true;
      frame = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
    }

    // Schedule a single frame when idle (resize / hover under reduced motion).
    function ensureFrame() {
      if (running || disposed) return;
      frame = requestAnimationFrame((now) => {
        running = true;
        step(now);
      });
    }

    function onPointerMove(event: PointerEvent) {
      const view = currentViewRef.current.scale > 0 ? currentViewRef.current : targetView();
      const world = invert(event.clientX, event.clientY, view);
      const found = quadtree.find(world.x, world.y, Math.max(18, 34 / Math.max(view.scale, 0.001)));
      const hit =
        found && Math.hypot(found.x - world.x, found.y - world.y) <= found.r + 18 / Math.max(view.scale, 0.001)
          ? found
          : null;

      if (hit?.id === hoveredRef.current?.id) {
        if (hit) show(event, tooltipFor(hit));
        return;
      }

      hoveredRef.current = hit;
      if (hit) show(event, tooltipFor(hit));
      else hide();
      ensureFrame();
    }

    function onPointerLeave() {
      hoveredRef.current = null;
      hide();
      ensureFrame();
    }

    function onClick() {
      const node = hoveredRef.current;
      if (node?.eventId) setSelected(node.eventId);
    }

    resize();
    start();
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [story, focus, storyViewport, highlightNodeIds, selectedId, setSelected, show, hide]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        aria-label="Scroll-driven MisBot story network"
        className="block h-full w-full cursor-crosshair"
      />
      {!story && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Loading story network ...
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_45%,transparent_0%,rgba(10,10,10,0.12)_46%,rgba(10,10,10,0.78)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background via-background/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/50 to-transparent" />
    </div>
  );
}

// Pre-rendered soft radial sprite. Drawn additively ("lighter") so overlapping
// nodes bloom into bright hubs — the main source of visual punch.
function makeGlowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const size = 96;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const sctx = sprite.getContext("2d")!;
  const grad = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.22, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.16)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, size, size);
  return sprite;
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: Viewport,
  time: number,
  reduceMotion: boolean,
) {
  const base = ctx.createRadialGradient(width * 0.5, height * 0.46, 0, width * 0.5, height * 0.46, width * 0.74);
  base.addColorStop(0, "rgba(24,16,12,0.9)");
  base.addColorStop(0.5, "rgba(12,11,12,0.94)");
  base.addColorStop(1, "rgba(7,7,8,0.98)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Slowly drifting aurora blobs give the dead-flat field depth and motion.
  const t = reduceMotion ? 0 : time;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  drawBlob(
    ctx,
    width * (0.34 + Math.sin(t * 0.06) * 0.05),
    height * (0.42 + Math.cos(t * 0.05) * 0.05),
    Math.max(width, height) * 0.42,
    233,
    106,
    44,
    0.07,
  );
  drawBlob(
    ctx,
    width * (0.68 + Math.cos(t * 0.045) * 0.05),
    height * (0.58 + Math.sin(t * 0.07) * 0.04),
    Math.max(width, height) * 0.38,
    111,
    159,
    216,
    0.055,
  );
  ctx.restore();

  // Parallax dot grid — quieter than hard lines, scrolls subtly with the camera.
  const spacing = 46;
  const offsetX = ((-view.centerX * view.scale) % spacing + spacing) % spacing;
  const offsetY = ((-view.centerY * view.scale) % spacing + spacing) % spacing;
  ctx.fillStyle = "rgba(237,237,237,0.05)";
  for (let x = offsetX; x < width; x += spacing) {
    for (let y = offsetY; y < height; y += spacing) {
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  nodeById: Map<string, StoryNetworkNode>,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
) {
  ctx.lineCap = "round";
  for (const edge of story.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    const s = project(source, view);
    const t = project(target, view);
    if (isOffscreen(s, width, height, 180) && isOffscreen(t, width, height, 180)) continue;

    const active = highlighted.has(edge.source) || highlighted.has(edge.target);
    const selected = selectedStoryIds.has(edge.source) || selectedStoryIds.has(edge.target);
    ctx.strokeStyle = selected
      ? "rgba(233,106,44,0.9)"
      : active
        ? edgeColor(edge.type, 0.46)
        : edgeColor(edge.type, 0.1);
    ctx.lineWidth = selected ? 1.7 : active ? 1.05 : 0.65;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    if (edge.c1x !== undefined && edge.c1y !== undefined) {
      const c = project({ x: edge.c1x, y: edge.c1y }, view);
      ctx.quadraticCurveTo(c.x, c.y, t.x, t.y);
    } else {
      ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();
  }
}

// Traveling pulses along propagation edges. Conveys diffusion and is the most
// motion-forward element, so it is capped and only runs in ambient mode.
function drawFlow(
  ctx: CanvasRenderingContext2D,
  flowEdges: FlowEdge[],
  sprite: HTMLCanvasElement,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
  time: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const flow of flowEdges) {
    const s = project(flow.source, view);
    const t = project(flow.target, view);
    if (isOffscreen(s, width, height, 60) && isOffscreen(t, width, height, 60)) continue;
    const c =
      flow.edge.c1x !== undefined && flow.edge.c1y !== undefined
        ? project({ x: flow.edge.c1x, y: flow.edge.c1y }, view)
        : { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };

    const u = (time * flow.speed + flow.phase) % 1;
    const inv = 1 - u;
    const px = inv * inv * s.x + 2 * inv * u * c.x + u * u * t.x;
    const py = inv * inv * s.y + 2 * inv * u * c.y + u * u * t.y;

    // Fade in/out at the endpoints so particles emerge from and arrive at nodes.
    const fade = Math.sin(Math.PI * u);
    const size = 11 + fade * 7;
    ctx.globalAlpha = 0.28 + fade * 0.55;
    ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
  }
  ctx.restore();
}

function drawNodeGlow(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  glowFor: (node: StoryNetworkNode) => HTMLCanvasElement,
  phaseById: Map<string, number>,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
  time: number,
  reduceMotion: boolean,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const node of story.nodes) {
    const p = project(node, view);
    const radius = Math.max(1.8, node.r * view.scale);
    if (isOffscreen(p, width, height, radius * 6 + 40)) continue;

    const active = highlighted.has(node.id);
    const selected = selectedStoryIds.has(node.id);
    const dimmed = highlighted.size > 0 && !active && !selected;
    if (dimmed && highlighted.size < story.nodes.length) continue;

    const phase = phaseById.get(node.id) ?? 0;
    const breathe = reduceMotion ? 1 : 0.8 + Math.sin(time * 1.6 + phase) * 0.2;
    const emphasis = selected ? 3.4 : active ? 2.6 : node.kind === "microblog" ? 2.2 : 1.7;
    const size = Math.max(10, radius * emphasis) * (0.9 + breathe * 0.25);
    const intensity = (selected ? 0.85 : active ? 0.6 : node.label === "fake" ? 0.4 : 0.26) * breathe;

    ctx.globalAlpha = intensity;
    ctx.drawImage(glowFor(node), p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.restore();
}

function drawNodeCores(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  hoveredId: string | null,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
) {
  for (const node of story.nodes) {
    const p = project(node, view);
    const radius = Math.max(1.8, node.r * view.scale);
    if (isOffscreen(p, width, height, radius + 60)) continue;

    const active = highlighted.has(node.id);
    const selected = selectedStoryIds.has(node.id);
    const hovered = hoveredId === node.id;
    const dimmed = highlighted.size > 0 && !active && !selected;
    const alpha = selected ? 1 : active ? 0.95 : dimmed ? 0.2 : 0.6;
    const fill = node.label === "fake" ? COLORS.hot : node.kind === "microblog" ? COLORS.ink : COLORS.cool;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.strokeStyle = selected || hovered ? COLORS.hot : "rgba(245,245,245,0.5)";
    ctx.lineWidth = selected || hovered ? 2 : 0.8;

    if (node.kind === "microblog") {
      const size = radius * 1.7;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Expanding radar rings on selected / highlighted hubs — pure motion accents.
function drawPulses(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  phaseById: Map<string, number>,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
  time: number,
  reduceMotion: boolean,
) {
  if (reduceMotion) return;
  ctx.save();
  let pulsed = 0;
  for (const node of story.nodes) {
    if (pulsed >= 60) break;
    const selected = selectedStoryIds.has(node.id);
    // Only the hub microblogs of the active set ping, to keep it sparse.
    const isHub = node.kind === "microblog" && highlighted.has(node.id);
    if (!selected && !isHub) continue;

    const p = project(node, view);
    const radius = Math.max(1.8, node.r * view.scale);
    if (isOffscreen(p, width, height, radius * 4 + 40)) continue;
    pulsed += 1;

    const phase = phaseById.get(node.id) ?? 0;
    const rings = selected ? 2 : 1;
    for (let i = 0; i < rings; i += 1) {
      const cycle = ((time * 0.55 + phase + i * 0.5) % 1);
      const ringR = radius + cycle * (selected ? 46 : 30);
      const alpha = (1 - cycle) * (selected ? 0.5 : 0.28);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(233,106,44,${alpha.toFixed(3)})`;
      ctx.lineWidth = selected ? 1.6 : 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHoverLabels(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  selectedStoryIds: Set<string>,
  hoveredId: string | null,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
) {
  for (const node of story.nodes) {
    const selected = selectedStoryIds.has(node.id);
    const hovered = hoveredId === node.id;
    if (!selected && !hovered) continue;
    const p = project(node, view);
    const radius = Math.max(1.8, node.r * view.scale);
    if (isOffscreen(p, width, height, radius + 60)) continue;

    if (node.name) {
      ctx.save();
      ctx.font = "10px var(--font-mono)";
      ctx.fillStyle = COLORS.inkSoft;
      ctx.globalAlpha = 0.94;
      ctx.fillText(node.name, p.x + radius + 8, p.y - radius - 3);
      ctx.restore();
    }
  }
}

function drawRegionLabel(ctx: CanvasRenderingContext2D, label: string, rule: string, width: number, height: number) {
  ctx.save();
  ctx.font = "10px var(--font-mono)";
  ctx.fillStyle = "rgba(237,237,237,0.62)";
  ctx.textBaseline = "bottom";
  ctx.fillText(label.toUpperCase(), 28, height - 34);
  ctx.fillStyle = "rgba(122,122,122,0.68)";
  ctx.fillText(rule.toUpperCase(), 28, height - 18);
  ctx.fillStyle = "rgba(233,106,44,0.88)";
  ctx.fillRect(18, height - 45, 3, 31);
  ctx.restore();
}

function tooltipFor(node: StoryNetworkNode): string {
  const kind = node.kind === "microblog" ? "microblog" : "actor";
  const label = node.label ? labelName(node.label) : kind;
  return `<b>${escapeHTML(node.name ?? node.refId)}</b>
    <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">kind</span><b>${escapeHTML(kind)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">label</span><b>${escapeHTML(label)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">cluster</span><b>${escapeHTML(node.cluster)}</b></div>`;
}

function edgeColor(type: string, alpha: number) {
  if (type === "comment" || type === "commentReply") return `rgba(111,159,216,${alpha})`;
  if (type === "repost" || type === "repostCascade") return `rgba(233,106,44,${alpha})`;
  return `rgba(237,237,237,${alpha})`;
}

function isOffscreen(point: ScreenPoint, width: number, height: number, margin: number) {
  return point.x < -margin || point.y < -margin || point.x > width + margin || point.y > height + margin;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
