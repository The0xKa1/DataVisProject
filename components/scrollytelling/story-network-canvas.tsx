"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { COLORS } from "@/lib/charts/colors";
import { resolveStoryNetwork } from "@/lib/charts/story-network";
import type { StoryFocusRegion, StoryNetwork, StoryNetworkNode, StoryNetworkEdge } from "@/lib/charts/types";
import { escapeHTML, labelName, selectionRuleName, storyLabelName } from "@/lib/format";
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
  delay: number;
  intensity: number;
  spread: number;
}

const FLOW_EDGE_CAP = 220;
const RIPPLE_DURATION = 2.4;
const LABEL_FONT = '10px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function StoryNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentViewRef = useRef<Viewport>({ centerX: 0, centerY: 0, scale: 0 });
  const hoveredRef = useRef<StoryNetworkNode | null>(null);

  const data = useDashboardStore((s) => s.data);
  const activeStoryPresetId = useDashboardStore((s) => s.activeStoryPresetId);
  const storyViewport = useDashboardStore((s) => s.storyViewport);
  const highlightNodeIds = useDashboardStore((s) => s.highlightNodeIds);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const selectedActorId = useDashboardStore((s) => s.selectedActorId);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const setSelectedActor = useDashboardStore((s) => s.setSelectedActor);
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
    const glowCanvasEl = glowCanvasRef.current;
    const context = canvasEl?.getContext("2d");
    const glowContext = glowCanvasEl?.getContext("2d");
    const storyData = story;
    if (!canvasEl || !glowCanvasEl || !context || !glowContext || !storyData) return;
    const canvas = canvasEl;
    const glowCanvas = glowCanvasEl;
    const ctx = context;
    const glowCtx = glowContext;
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
      network.nodes
        .filter((node) => node.eventId === selectedId || node.refId === selectedActorId)
        .map((node) => node.id),
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
      const selected = selectedStoryIds.has(edge.source) || selectedStoryIds.has(edge.target);
      const include = isOverview
        ? edge.type === "repost" || edge.type === "repostCascade" || selected
        : active || selected;
      if (!include) continue;
      const distance = Math.hypot(target.x - source.x, target.y - source.y);
      const closeToCore = source.kind === "microblog" || target.kind === "microblog";
      const spread = clamp((distance - 80) / 720, 0, 1);
      const intensity = selected ? 1 : active ? (closeToCore ? 0.9 : 0.68) : 0.38;
      flowEdges.push({
        edge,
        source,
        target,
        phase: hashUnit(`${edge.source}|${edge.target}|${edge.type}`),
        speed: (0.11 + hashUnit(`${edge.target}|${edge.source}`) * 0.075) *
          (closeToCore ? 1.18 : 0.82) *
          (1 - spread * 0.25),
        delay: spread * 0.55 + hashUnit(`${edge.type}|${edge.source}`) * 0.45,
        intensity,
        spread,
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
      glowCanvas.width = Math.floor(width * dpr);
      glowCanvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      glowCtx.clearRect(0, 0, width, height);
      drawBackdrop(glowCtx, width, height, view, time, reduceMotion);
      drawEdges(glowCtx, network, nodeById, highlighted, selectedStoryIds, view, project, width, height, time, reduceMotion, "glow");
      if (!reduceMotion) drawFlow(glowCtx, flowEdges, glowHot, view, project, width, height, time, reduceMotion, true);
      drawNodeGlow(glowCtx, network, highlighted, selectedStoryIds, glowFor, phaseById, view, project, width, height, time, reduceMotion, true);
      drawFocusRipple(glowCtx, network, focus, highlighted, selectedStoryIds, view, project, width, height, time, reduceMotion, true);

      ctx.clearRect(0, 0, width, height);
      drawEdges(ctx, network, nodeById, highlighted, selectedStoryIds, view, project, width, height, time, reduceMotion);
      if (!reduceMotion) drawFlow(ctx, flowEdges, glowHot, view, project, width, height, time, reduceMotion);
      drawNodeGlow(ctx, network, highlighted, selectedStoryIds, glowFor, phaseById, view, project, width, height, time, reduceMotion);
      drawFocusRipple(ctx, network, focus, highlighted, selectedStoryIds, view, project, width, height, time, reduceMotion);
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
      if (node?.kind === "actor") setSelectedActor(node.refId);
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
  }, [story, focus, storyViewport, highlightNodeIds, selectedId, selectedActorId, setSelected, setSelectedActor, show, hide]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <canvas
        ref={glowCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 block h-full w-full opacity-75 blur-[6px] saturate-150 mix-blend-screen"
      />
      <canvas
        ref={canvasRef}
        aria-label="滚动驱动的 MisBot 叙事网络"
        className="relative z-10 block h-full w-full cursor-crosshair"
      />
      {!story && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            正在加载叙事网络...
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_48%,transparent_0%,transparent_52%,rgba(5,5,5,0.58)_86%,rgba(5,5,5,0.9)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-background via-background/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-36 bg-gradient-to-t from-background via-background/55 to-transparent" />
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

  const lineSpacing = 184;
  const lineOffsetX = ((-view.centerX * view.scale * 0.22) % lineSpacing + lineSpacing) % lineSpacing;
  const lineOffsetY = ((-view.centerY * view.scale * 0.22) % lineSpacing + lineSpacing) % lineSpacing;
  ctx.strokeStyle = "rgba(237,237,237,0.018)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = lineOffsetX; x < width; x += lineSpacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = lineOffsetY; y < height; y += lineSpacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  const dustCount = Math.min(110, Math.floor((width * height) / 14000));
  ctx.fillStyle = "rgba(237,237,237,0.12)";
  for (let i = 0; i < dustCount; i += 1) {
    const seed = hashUnit(`story-field-${i}`);
    const drift = reduceMotion ? 0 : Math.sin(t * 0.04 + seed * Math.PI * 2) * 0.012;
    const x = wrapUnit(seed + view.centerX * 0.000035 + drift) * width;
    const y = wrapUnit(hashUnit(`story-depth-${i}`) + view.centerY * 0.000028 - drift) * height;
    const alpha = 0.025 + seed * 0.06;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
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
  time: number,
  reduceMotion: boolean,
  layer: "main" | "glow" = "main",
) {
  const glow = layer === "glow";
  const broadOverview = highlighted.size >= story.nodes.length * 0.6;
  ctx.save();
  if (glow) ctx.globalCompositeOperation = "lighter";
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
    if (glow && !active && !selected) continue;

    const dimmed = highlighted.size > 0 && !active && !selected && !broadOverview;
    const rgb = edgeRGB(edge.type);
    const highAlpha = selected
      ? glow ? 0.7 : 0.88
      : active
        ? glow ? 0.36 : 0.42
        : broadOverview
          ? glow ? 0.08 : 0.075
          : 0.045;
    const lowAlpha = selected
      ? glow ? 0.14 : 0.22
      : active
        ? glow ? 0.07 : 0.09
        : broadOverview
          ? 0.018
          : 0.01;
    const sourceAlpha = source.kind === "microblog" || selectedStoryIds.has(edge.source)
      ? highAlpha
      : dimmed
        ? lowAlpha * 0.75
        : lowAlpha;
    const targetAlpha = target.kind === "microblog" || selectedStoryIds.has(edge.target)
      ? highAlpha
      : dimmed
        ? lowAlpha * 0.75
        : lowAlpha;
    const gradient = ctx.createLinearGradient(s.x, s.y, t.x, t.y);
    gradient.addColorStop(0, rgba(rgb, sourceAlpha));
    gradient.addColorStop(0.58, rgba(rgb, Math.max(sourceAlpha, targetAlpha) * (glow ? 0.42 : 0.34)));
    gradient.addColorStop(1, rgba(rgb, targetAlpha));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = glow
      ? selected ? 5.2 : active ? 3.2 : 1.6
      : selected ? 1.55 : active ? 0.95 : dimmed ? 0.34 : 0.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    const c = edgeControlPoint(edge, s, t, view, project, time, reduceMotion);
    ctx.quadraticCurveTo(c.x, c.y, t.x, t.y);
    ctx.stroke();
  }
  ctx.restore();
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
  reduceMotion: boolean,
  bloomLayer = false,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const flow of flowEdges) {
    const s = project(flow.source, view);
    const t = project(flow.target, view);
    if (isOffscreen(s, width, height, 60) && isOffscreen(t, width, height, 60)) continue;
    const c = edgeControlPoint(flow.edge, s, t, view, project, time, reduceMotion);
    const count = flow.intensity > 0.86 && !bloomLayer ? 2 : 1;

    for (let i = 0; i < count; i += 1) {
      const u = wrapUnit(time * flow.speed - flow.delay + flow.phase + i * 0.46);
      const inv = 1 - u;
      const px = inv * inv * s.x + 2 * inv * u * c.x + u * u * t.x;
      const py = inv * inv * s.y + 2 * inv * u * c.y + u * u * t.y;

      const fade = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 1.35);
      const attenuation = (1 - flow.spread * 0.48) * flow.intensity;
      const size = (bloomLayer ? 14 : 7) + fade * (bloomLayer ? 22 : 11);
      ctx.globalAlpha = (bloomLayer ? 0.18 : 0.2) + fade * (bloomLayer ? 0.28 : 0.52) * attenuation;
      ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
    }
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
  bloomLayer = false,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const node of story.nodes) {
    const p = project(node, view);
    const active = highlighted.has(node.id);
    const selected = selectedStoryIds.has(node.id);
    const radius = renderRadius(node, view, active, selected, false);
    if (isOffscreen(p, width, height, radius * 6 + 40)) continue;

    const dimmed = highlighted.size > 0 && !active && !selected;
    if (dimmed && highlighted.size < story.nodes.length) continue;

    const phase = phaseById.get(node.id) ?? 0;
    const breathe = reduceMotion ? 1 : 0.8 + Math.sin(time * 1.6 + phase) * 0.2;
    const emphasis = bloomLayer
      ? selected ? 6.8 : active ? 4.6 : node.kind === "microblog" ? 3.6 : 2.4
      : selected ? 3.4 : active ? 2.4 : node.kind === "microblog" ? 1.9 : 1.45;
    const size = Math.max(bloomLayer ? 18 : 8, radius * emphasis) * (0.9 + breathe * 0.25);
    const intensity = (
      bloomLayer
        ? selected ? 0.62 : active ? 0.4 : node.label === "fake" ? 0.2 : 0.12
        : selected ? 0.78 : active ? 0.5 : node.label === "fake" ? 0.26 : 0.16
    ) * breathe;

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

    const active = highlighted.has(node.id);
    const selected = selectedStoryIds.has(node.id);
    const hovered = hoveredId === node.id;
    const dimmed = highlighted.size > 0 && !active && !selected;
    const alpha = selected ? 1 : active ? 0.95 : dimmed ? 0.2 : 0.6;
    const fill = node.label === "fake" ? COLORS.hot : node.kind === "microblog" ? COLORS.ink : COLORS.cool;
    const radius = renderRadius(node, view, active, selected, hovered);
    if (isOffscreen(p, width, height, radius + 60)) continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.strokeStyle = selected || hovered ? COLORS.hot : "rgba(245,245,245,0.5)";
    ctx.lineWidth = selected || hovered ? 2 : 0.8;

    if (node.kind === "microblog") {
      const size = radius * 2.05;
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
    const radius = renderRadius(node, view, isHub, selected, false);
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

function drawFocusRipple(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  focus: StoryFocusRegion | null,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  width: number,
  height: number,
  time: number,
  reduceMotion: boolean,
  bloomLayer = false,
) {
  if (reduceMotion || time > RIPPLE_DURATION) return;
  const nodeById = new Map(story.nodes.map((node) => [node.id, node]));
  const selected = story.nodes.filter((node) => selectedStoryIds.has(node.id));
  const focusNodes = (focus?.nodeIds ?? [])
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is StoryNetworkNode => !!node);
  const anchors = (selected.length ? selected : focusNodes.filter((node) => node.kind === "microblog")).slice(0, 4);
  const fallback: StoryNetworkNode[] = focus
    ? [{
        id: focus.id,
        refId: focus.id,
        kind: "microblog" as const,
        x: focus.centerX,
        y: focus.centerY,
        r: 24,
        cluster: focus.id,
        weight: 1,
      }]
    : [];
  const nodes = anchors.length ? anchors : fallback;
  if (!nodes.length) return;

  const cycle = clamp(time / RIPPLE_DURATION, 0, 1);
  const eased = easeOutCubic(cycle);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const node of nodes) {
    const p = project(node, view);
    if (isOffscreen(p, width, height, 220)) continue;
    const rgb = node.label === "fake" ? ([233, 106, 44] as const) : ([111, 159, 216] as const);
    const active = highlighted.has(node.id);
    const selectedNode = selectedStoryIds.has(node.id);
    const baseRadius = renderRadius(node, view, active, selectedNode, false);
    const spread = (bloomLayer ? 210 : 132) * (0.82 + hashUnit(`${node.id}:ripple`) * 0.34);
    const ringRadius = baseRadius + eased * spread;
    const alpha = Math.pow(1 - cycle, 2) * (bloomLayer ? 0.28 : 0.5);

    ctx.beginPath();
    ctx.arc(p.x, p.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(rgb, alpha);
    ctx.lineWidth = bloomLayer ? 7 : 1.4 + (1 - cycle) * 1.5;
    ctx.stroke();
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
    const radius = renderRadius(node, view, selected, selected, hovered);
    if (isOffscreen(p, width, height, radius + 60)) continue;

    if (node.name) {
      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.textBaseline = "middle";
      const text = node.name;
      const labelX = p.x + radius + 8;
      const labelY = p.y - radius - 4;
      const metrics = ctx.measureText(text);
      const boxW = metrics.width + 13;
      const boxH = 18;
      ctx.globalAlpha = hovered ? 0.92 : 0.76;
      fillRoundRect(ctx, labelX - 6, labelY - boxH / 2, boxW, boxH, 4, "rgba(5,5,5,0.72)");
      ctx.strokeStyle = hovered ? "rgba(233,106,44,0.52)" : "rgba(237,237,237,0.16)";
      ctx.lineWidth = 1;
      strokeRoundRect(ctx, labelX - 6, labelY - boxH / 2, boxW, boxH, 4);
      ctx.globalAlpha = hovered ? 0.98 : 0.86;
      ctx.fillStyle = COLORS.inkSoft;
      ctx.fillText(text, labelX, labelY);
      ctx.restore();
    }
  }
}

function drawRegionLabel(ctx: CanvasRenderingContext2D, label: string, rule: string, width: number, height: number) {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.fillStyle = "rgba(237,237,237,0.62)";
  ctx.textBaseline = "bottom";
  ctx.fillText(storyLabelName(label), 28, height - 34);
  ctx.fillStyle = "rgba(122,122,122,0.68)";
  ctx.fillText(selectionRuleName(rule), 28, height - 18);
  ctx.fillStyle = "rgba(233,106,44,0.88)";
  ctx.fillRect(18, height - 45, 3, 31);
  ctx.restore();
}

function tooltipFor(node: StoryNetworkNode): string {
  const kind = node.kind === "microblog" ? "微博" : "参与者";
  const label = node.label ? labelName(node.label) : kind;
  const botPct = Math.round((node.botShare ?? 0) * 100);
  const fakePct = Math.round((node.fakeShare ?? 0) * 100);
  return `<b>${escapeHTML(node.name ?? node.refId)}</b>
    <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">类型</span><b>${escapeHTML(kind)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">标签</span><b>${escapeHTML(label)}</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">水军代理</span><b>${botPct}%</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">虚假参与</span><b>${fakePct}%</b></div>
    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">簇</span><b>${escapeHTML(node.cluster)}</b></div>`;
}

function isOffscreen(point: ScreenPoint, width: number, height: number, margin: number) {
  return point.x < -margin || point.y < -margin || point.x > width + margin || point.y > height + margin;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function edgeControlPoint(
  edge: StoryNetworkEdge,
  source: ScreenPoint,
  target: ScreenPoint,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => ScreenPoint,
  time: number,
  reduceMotion: boolean,
): ScreenPoint {
  const control = edge.c1x !== undefined && edge.c1y !== undefined
    ? project({ x: edge.c1x, y: edge.c1y }, view)
    : { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  if (reduceMotion) return control;

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / distance;
  const ny = dx / distance;
  const phase = hashUnit(`${edge.source}:${edge.target}:wind`) * Math.PI * 2;
  const amplitude = clamp(distance * 0.018, 1.2, 8.5);
  const wave = Math.sin(time * 0.72 + phase) * amplitude;
  return {
    x: control.x + nx * wave,
    y: control.y + ny * wave,
  };
}

function renderRadius(
  node: Pick<StoryNetworkNode, "kind" | "r">,
  view: Viewport,
  active: boolean,
  selected: boolean,
  hovered: boolean,
) {
  const base = Math.max(0.2, node.r * view.scale);
  if (node.kind === "microblog") {
    const radius = Math.pow(base, 1.08) * 1.05 + 1.8;
    return radius * (selected ? 1.24 : hovered ? 1.16 : active ? 1 : 0.84);
  }

  const radius = Math.pow(base, 0.76) * 0.62;
  const min = selected || hovered ? 2.2 : active ? 1.35 : 0.85;
  const max = selected || hovered ? 6.2 : active ? 4.4 : 2.4;
  return clamp(radius, min, max);
}

function edgeRGB(type: string): readonly [number, number, number] {
  if (type === "comment" || type === "commentReply") return [111, 159, 216];
  if (type === "repost" || type === "repostCascade") return [233, 106, 44];
  return [237, 237, 237];
}

function rgba(rgb: readonly [number, number, number], alpha: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(alpha, 0, 1).toFixed(3)})`;
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
) {
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapUnit(value: number) {
  return value - Math.floor(value);
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
