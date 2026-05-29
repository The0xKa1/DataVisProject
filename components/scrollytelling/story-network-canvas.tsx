"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { COLORS } from "@/lib/charts/colors";
import { resolveStoryNetwork } from "@/lib/charts/story-network";
import type { StoryNetwork, StoryNetworkNode } from "@/lib/charts/types";
import { escapeHTML, labelName } from "@/lib/format";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";

interface Viewport {
  centerX: number;
  centerY: number;
  scale: number;
}

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
    let disposed = false;
    let width = 1;
    let height = 1;
    let dpr = 1;

    const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
    const highlighted = new Set(highlightNodeIds.length ? highlightNodeIds : focus?.nodeIds ?? []);
    const selectedStoryIds = new Set(
      selectedId ? network.nodes.filter((node) => node.eventId === selectedId).map((node) => node.id) : [],
    );
    const quadtree = d3
      .quadtree<StoryNetworkNode>()
      .x((node) => node.x)
      .y((node) => node.y)
      .addAll(network.nodes);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      requestDraw();
    });
    resizeObserver.observe(canvas);

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

    function project(node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) {
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

    function draw(view: Viewport) {
      ctx.clearRect(0, 0, width, height);
      drawBackdrop(ctx, width, height);
      drawEdges(ctx, network, nodeById, highlighted, selectedStoryIds, view, project, width, height);
      drawNodes(ctx, network, highlighted, selectedStoryIds, hoveredRef.current?.id ?? null, view, project, width, height);
      drawRegionLabel(ctx, focus?.label ?? "Story network", network.selectionRule, width, height);
    }

    function tick() {
      if (disposed) return;
      const target = targetView();
      const current = currentViewRef.current.scale > 0 ? currentViewRef.current : target;
      const next = {
        centerX: lerp(current.centerX, target.centerX, 0.095),
        centerY: lerp(current.centerY, target.centerY, 0.095),
        scale: lerp(current.scale, target.scale, 0.095),
      };
      currentViewRef.current = next;
      draw(next);

      const moving =
        Math.abs(next.centerX - target.centerX) > 0.8 ||
        Math.abs(next.centerY - target.centerY) > 0.8 ||
        Math.abs(next.scale - target.scale) > 0.002;
      if (moving) frame = requestAnimationFrame(tick);
    }

    function requestDraw() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
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
      draw(view);
    }

    function onPointerLeave() {
      hoveredRef.current = null;
      hide();
      draw(currentViewRef.current.scale > 0 ? currentViewRef.current : targetView());
    }

    function onClick() {
      const node = hoveredRef.current;
      if (node?.eventId) setSelected(node.eventId);
    }

    resize();
    requestDraw();
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_45%,transparent_0%,rgba(10,10,10,0.18)_44%,rgba(10,10,10,0.82)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background via-background/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background via-background/50 to-transparent" />
    </div>
  );
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.46, 0, width * 0.5, height * 0.46, width * 0.72);
  gradient.addColorStop(0, "rgba(233,106,44,0.05)");
  gradient.addColorStop(0.48, "rgba(111,159,216,0.025)");
  gradient.addColorStop(1, "rgba(10,10,10,0.86)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(237,237,237,0.035)";
  ctx.lineWidth = 1;
  for (let x = (width % 68) - 68; x < width + 68; x += 68) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = (height % 68) - 68; y < height + 68; y += 68) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  nodeById: Map<string, StoryNetworkNode>,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => { x: number; y: number },
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
      ? "rgba(233,106,44,0.86)"
      : active
        ? edgeColor(edge.type, 0.42)
        : edgeColor(edge.type, 0.13);
    ctx.lineWidth = selected ? 1.6 : active ? 1.05 : 0.7;
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

function drawNodes(
  ctx: CanvasRenderingContext2D,
  story: StoryNetwork,
  highlighted: Set<string>,
  selectedStoryIds: Set<string>,
  hoveredId: string | null,
  view: Viewport,
  project: (node: Pick<StoryNetworkNode, "x" | "y">, view: Viewport) => { x: number; y: number },
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
    const alpha = selected ? 1 : active ? 0.88 : dimmed ? 0.22 : 0.55;
    const fill = node.label === "fake" ? COLORS.hot : node.kind === "microblog" ? COLORS.ink : COLORS.cool;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.strokeStyle = selected || hovered ? COLORS.hot : "rgba(237,237,237,0.42)";
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

    if (selected || hovered) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(233,106,44,0.22)";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(14, radius * 2.1), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if ((selected || hovered) && node.name) {
      ctx.save();
      ctx.font = "10px var(--font-mono)";
      ctx.fillStyle = COLORS.inkSoft;
      ctx.globalAlpha = 0.92;
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

function isOffscreen(point: { x: number; y: number }, width: number, height: number, margin: number) {
  return point.x < -margin || point.y < -margin || point.x > width + margin || point.y > height + margin;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
