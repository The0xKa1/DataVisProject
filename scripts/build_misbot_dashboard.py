#!/usr/bin/env python3
"""Build the MisBot dashboard JSON used by the static visual analytics UI.

The script expects the privacy-preserving MisBot release to be unpacked under:

    data/raw/misbot/
      Information_Instances/
        misinformation.jsonl
        verified_information.jsonl
        trend_information.jsonl
      User_Instances/
        train_data.jsonl
        train_data_sampled.jsonl
        inference_data.jsonl
        inference_labels.json

It intentionally emits only short hashed ids, truncated text, and aggregate
signals suitable for the public dashboard artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


INFO_FILES = {
    "misinformation": ("misinformation.jsonl", "fake"),
    "verified_information": ("verified_information.jsonl", "real"),
    "trend_information": ("trend_information.jsonl", "real"),
}

STOPWORDS = {
    "微博",
    "一个",
    "我们",
    "他们",
    "这个",
    "那个",
    "今天",
    "现在",
    "进行",
    "没有",
    "已经",
    "可以",
    "因为",
    "但是",
    "如果",
    "不是",
    "自己",
    "相关",
    "信息",
    "视频",
    "全文",
    "展开",
}

DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%a %b %d %H:%M:%S %z %Y",
)


@dataclass(frozen=True)
class UserLabel:
    bot_label: str
    bot_score: float
    label_source: str


def sha_short(value: Any, length: int = 8) -> str:
    raw = str(value if value is not None else "unknown").encode("utf-8", "ignore")
    return hashlib.sha256(raw).hexdigest()[:length]


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value in (None, ""):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def truncate_text(text: Any, limit: int) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "..."


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        stamp = float(value)
        if stamp > 10_000_000_000:
            stamp /= 1000
        try:
            return datetime.fromtimestamp(stamp)
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("T", " ").replace("Z", "+0000")
    if re.fullmatch(r"\d{10,13}(\.\d+)?", text):
        stamp = float(text)
        if stamp > 10_000_000_000:
            stamp /= 1000
        try:
            return datetime.fromtimestamp(stamp)
        except (OverflowError, OSError, ValueError):
            return None
    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(text, fmt)
            if parsed.tzinfo:
                parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
            return parsed
        except ValueError:
            continue
    return None


def format_date(value: datetime | None) -> str:
    if not value:
        return ""
    return value.strftime("%Y-%m-%d %H:%M")


def month_key(value: datetime | None) -> str:
    if not value:
        return "unknown"
    return value.strftime("%Y-%m")


def find_file(root: Path, filename: str) -> Path | None:
    direct = root / filename
    if direct.exists():
        return direct
    matches = sorted(root.rglob(filename))
    return matches[0] if matches else None


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSONL record: {exc}") from exc
            if isinstance(data, dict):
                yield data


def get_first(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return default


def iter_user_ids(value: Any) -> Iterable[str]:
    if value in (None, ""):
        return
    if isinstance(value, dict):
        for key in ("uid", "user_id", "userid", "user", "id", "mid"):
            if key in value and value[key] not in (None, ""):
                yield str(value[key])
                return
        for nested in value.values():
            yield from iter_user_ids(nested)
        return
    if isinstance(value, (list, tuple, set)):
        for item in value:
            yield from iter_user_ids(item)
        return
    yield str(value)


def parse_bot_prediction(value: Any) -> tuple[int | None, float | None]:
    if isinstance(value, dict):
        pred = get_first(value, "prediction", "pred", "label", "bot", "is_bot")
        score = get_first(value, "score", "bot_score", "prob", "probability")
        return parse_bot_prediction([pred, score])
    if isinstance(value, (list, tuple)):
        pred = value[0] if len(value) >= 1 else None
        score = value[1] if len(value) >= 2 else pred
        pred_int = None if pred is None else safe_int(pred, default=-1)
        return (pred_int if pred_int in (0, 1) else None, safe_float(score, default=float(pred_int or 0)))
    if isinstance(value, str):
        lower = value.strip().lower()
        if lower in {"bot", "1", "true", "yes"}:
            return 1, 1.0
        if lower in {"human", "genuine", "0", "false", "no"}:
            return 0, 0.0
    if isinstance(value, (int, float, bool)):
        pred = int(value)
        if pred in (0, 1):
            return pred, float(pred)
    return None, None


def user_label_from_prediction(value: Any, source: str) -> UserLabel | None:
    pred, score = parse_bot_prediction(value)
    if pred is None and score is None:
        return None
    score_value = 1.0 if score is None and pred == 1 else 0.0 if score is None else max(0.0, min(1.0, score))
    is_bot = pred == 1 or score_value >= 0.75
    return UserLabel("bot" if is_bot else "human", score_value, source)


def load_user_labels(user_root: Path) -> dict[str, UserLabel]:
    labels: dict[str, UserLabel] = {}

    for filename in ("train_data_sampled.jsonl", "train_data.jsonl"):
        path = find_file(user_root, filename)
        if not path:
            continue
        for row in iter_jsonl(path):
            uid = get_first(row, "uid", "user_id", "userid", "id")
            parsed = user_label_from_prediction(row.get("label"), "human")
            if uid not in (None, "") and parsed:
                labels[str(uid)] = parsed

    inference_path = find_file(user_root, "inference_labels.json")
    if inference_path:
        with inference_path.open("r", encoding="utf-8") as handle:
            raw_labels = json.load(handle)
        if isinstance(raw_labels, dict):
            for uid, value in raw_labels.items():
                if str(uid) in labels:
                    continue
                parsed = user_label_from_prediction(value, "proxy")
                if parsed:
                    labels[str(uid)] = parsed

    return labels


def label_counts(users: Iterable[str], labels: dict[str, UserLabel]) -> tuple[int, int, int, float]:
    unique_users = set(users)
    bot = human = unknown = 0
    for uid in unique_users:
        label = labels.get(uid)
        if not label:
            unknown += 1
        elif label.bot_label == "bot":
            bot += 1
        else:
            human += 1
    known = bot + human
    bot_share = bot / known if known else 0.0
    return bot, human, unknown, bot_share


def extract_terms(text: str) -> list[str]:
    terms: list[str] = []
    for tag in re.findall(r"#([^#\n\r]{2,40})#", text):
        clean = re.sub(r"\s+", "", tag)
        if clean and clean not in STOPWORDS:
            terms.append(clean[:24])

    for token in re.findall(r"[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9_-]{2,24}", text):
        if token in STOPWORDS:
            continue
        if token.lower() in {"http", "https", "weibo", "com"}:
            continue
        terms.append(token[:24])

    deduped = []
    seen = set()
    for term in terms:
        if term not in seen:
            seen.add(term)
            deduped.append(term)
    return deduped[:8]


def extract_phrases(text: str) -> list[str]:
    phrases = [tag[:40] for tag in re.findall(r"#([^#\n\r]{4,60})#", text)]
    compact = re.sub(r"\s+", "", text)
    if len(compact) >= 12:
        phrases.append(compact[:28])
    return [p for p in phrases if p]


def actor_summary(uid: str, stats: dict[str, Any], labels: dict[str, UserLabel]) -> dict[str, Any]:
    label = labels.get(uid, UserLabel("unknown", 0.0, "unknown"))
    total = stats["comments"] + stats["reposts"] + stats["attitudes"]
    label_total = stats["fake"] + stats["real"]
    fake_share = stats["fake"] / label_total if label_total else 0.0
    top_events = [event_id for _score, event_id in stats.get("top_events", [])]
    if not top_events and stats.get("top_event_id"):
        top_events = [stats["top_event_id"]]
    return {
        "user": sha_short(uid),
        "comments": stats["comments"],
        "reposts": stats["reposts"],
        "attitudes": stats["attitudes"],
        "fake": stats["fake"],
        "real": stats["real"],
        "eventCount": stats.get("events", 0),
        "fakeEventCount": stats.get("fake_events", 0),
        "realEventCount": stats.get("real_events", 0),
        "fakeShare": round(fake_share, 4),
        "botLabel": label.bot_label,
        "botScore": round(label.bot_score, 4),
        "labelSource": label.label_source,
        "topEventIds": top_events,
        "score": round(
            math.log1p(total) * 4
            + stats.get("events", 0) * 0.6
            + fake_share * 20
            + label.bot_score * 12,
            4,
        ),
    }


def remember_actor_event(stats: dict[str, Any], event_id: str, score: int, limit: int = 8) -> None:
    top_events = stats.setdefault("top_events", [])
    top_events.append((score, event_id))
    top_events.sort(reverse=True)
    del top_events[limit:]


def graph_meta(row: dict[str, Any]) -> dict[str, int]:
    repost_graph = row.get("repost_graph") if isinstance(row.get("repost_graph"), dict) else {}
    repost_nodes = len(repost_graph.get("nodes") or [])
    repost_edges = len(repost_graph.get("edges") or [])
    comment_nodes = 0
    comment_edges = 0
    for graph in row.get("comment_graphs") or []:
        if not isinstance(graph, dict):
            continue
        comment_nodes += len(graph.get("nodes") or [])
        comment_edges += len(graph.get("edges") or [])
    return {
        "repostNodes": repost_nodes,
        "repostEdges": repost_edges,
        "commentNodes": comment_nodes,
        "commentEdges": comment_edges,
        "cascadeEdges": repost_edges + comment_edges,
    }


def max_tree_depth(edges: Any) -> int:
    parent_by_child: dict[int, int] = {}
    if not isinstance(edges, list):
        return 0
    for edge in edges:
        if not isinstance(edge, list) or len(edge) < 2:
            continue
        child = safe_int(edge[0], -1)
        parent = safe_int(edge[1], -1)
        if child >= 0 and parent >= 0 and child != parent:
            parent_by_child[child] = parent
    if not parent_by_child:
        return 0

    cache: dict[int, int] = {}

    def depth(node: int, trail: set[int]) -> int:
        if node in cache:
            return cache[node]
        parent = parent_by_child.get(node)
        if parent is None or parent in trail:
            cache[node] = 1
            return 1
        value = 1 + depth(parent, trail | {node})
        cache[node] = value
        return value

    return max(depth(node, set()) for node in parent_by_child)


def month_to_date(month: str, day: int = 1) -> datetime | None:
    if month == "unknown":
        return None
    try:
        year, month_no = month.split("-")
        return datetime(int(year), int(month_no), day)
    except (ValueError, TypeError):
        return None


def add_months(value: datetime, months: int) -> datetime:
    year = value.year + (value.month - 1 + months) // 12
    month_no = (value.month - 1 + months) % 12 + 1
    return datetime(year, month_no, 1)


def month_range(start: str, end: str) -> set[str]:
    start_dt = month_to_date(start)
    end_dt = month_to_date(end)
    if not start_dt or not end_dt or start_dt > end_dt:
        return set()
    months: set[str] = set()
    current = start_dt
    while current <= end_dt:
        months.add(current.strftime("%Y-%m"))
        current = add_months(current, 1)
    return months


def build_burst_windows(
    timeline: list[dict[str, Any]],
    events: list[dict[str, Any]],
    keyword_counts_by_month: dict[str, Counter[str]],
    max_windows: int,
) -> list[dict[str, Any]]:
    events_by_month: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        events_by_month[event.get("month", "unknown")].append(event)

    windows = []
    rows = [row for row in timeline if row["month"] != "unknown"]
    for index, row in enumerate(rows):
        span = rows[max(0, index - 1) : min(len(rows), index + 2)]
        months = [r["month"] for r in span]
        fake = sum(r["fake"] for r in span)
        real = sum(r["real"] for r in span)
        comments = sum(r["comments"] for r in span)
        reposts = sum(r["reposts"] for r in span)
        attitudes = sum(r.get("attitudes", 0) for r in span)
        bots = sum(r.get("botUsers", 0) for r in span)
        humans = sum(r.get("humanUsers", 0) for r in span)
        known = bots + humans
        bot_share = bots / known if known else 0.0
        window_events = []
        terms = Counter()
        for month in months:
            window_events.extend(events_by_month.get(month, []))
            terms.update(keyword_counts_by_month.get(month, Counter()))
        window_events.sort(key=lambda e: (e.get("score", 0), e.get("botShare", 0)), reverse=True)
        engagement = comments + reposts + attitudes
        score = fake * 5 + math.log1p(engagement) * 2 + bot_share * 40
        windows.append(
            {
                "id": f"bw-{row['month']}",
                "startMonth": months[0],
                "endMonth": months[-1],
                "peakMonth": row["month"],
                "fake": fake,
                "real": real,
                "engagement": engagement,
                "botShare": round(bot_share, 4),
                "eventIds": [event["id"] for event in window_events[:16]],
                "topKeywords": [term for term, _ in terms.most_common(8)],
                "score": round(score, 4),
            }
        )
    windows.sort(key=lambda row: row["score"], reverse=True)
    return windows[:max_windows]


def build_template_signals(
    phrases: list[dict[str, Any]],
    phrase_event_ids: dict[str, list[str]],
    max_templates: int,
) -> list[dict[str, Any]]:
    signals = []
    for index, phrase in enumerate(phrases[:max_templates]):
        signals.append(
            {
                "id": f"tp-{index + 1:04d}",
                "text": phrase["text"],
                "count": phrase["count"],
                "users": phrase["users"],
                "botUsers": phrase.get("botUsers", 0),
                "botShare": phrase.get("botShare", 0.0),
                "eventIds": phrase_event_ids.get(phrase["text"], [])[:16],
            }
        )
    return signals


def choose_case_event_ids(
    events: list[dict[str, Any]],
    burst_windows: list[dict[str, Any]],
    template_signals: list[dict[str, Any]],
    hub_actors: list[dict[str, Any]],
    max_shards: int,
) -> list[str]:
    events_by_id = {event["id"]: event for event in events}

    def event_story_score(event_id: str) -> float:
        event = events_by_id.get(event_id, {})
        label_bonus = 4.0 if event.get("label") == "fake" else 0.0
        bot_bonus = safe_float(event.get("botShare"), 0.0) * 3.0
        scale_bonus = math.log1p(safe_float(event.get("score"), 0.0)) / 4.0
        participant_bonus = math.log1p(
            safe_int(event.get("commentCount"), 0)
            + safe_int(event.get("repostCount"), 0)
            + safe_int(event.get("attitudeCount"), 0)
        ) / 7.0
        return label_bonus + bot_bonus + scale_bonus + participant_bonus

    def hub_story_score(actor: dict[str, Any]) -> float:
        activity = (
            safe_int(actor.get("comments"), 0)
            + safe_int(actor.get("reposts"), 0)
            + safe_int(actor.get("attitudes"), 0)
        )
        return (
            safe_float(actor.get("fakeShare"), 0.0) * 3.0
            + safe_float(actor.get("botScore"), 0.0) * 2.4
            + math.log1p(activity) / 5.0
            + math.log1p(safe_int(actor.get("eventCount"), 0)) / 5.0
        )

    ordered: list[str] = []
    for window in burst_windows[:2]:
        ranked = sorted(window.get("eventIds", []), key=event_story_score, reverse=True)
        ordered.extend(ranked[:3])
    for template in template_signals[:6]:
        ranked = sorted(template.get("eventIds", []), key=event_story_score, reverse=True)
        ordered.extend(ranked[:1])
    for actor in sorted(hub_actors, key=hub_story_score, reverse=True)[:16]:
        ordered.extend(actor.get("topEventIds", [])[:1])
    for window in burst_windows[2:8]:
        ranked = sorted(window.get("eventIds", []), key=event_story_score, reverse=True)
        ordered.extend(ranked[:2])
    ordered.extend(event["id"] for event in events[:max_shards])

    seen: set[str] = set()
    case_ids = []
    for event_id in ordered:
        if event_id in seen:
            continue
        seen.add(event_id)
        case_ids.append(event_id)
        if len(case_ids) >= max_shards:
            break
    return case_ids


def actor_graph_node(uid: str, actor_stats: dict[str, dict[str, Any]], labels: dict[str, UserLabel]) -> dict[str, Any]:
    stats = actor_stats.get(uid, {})
    label = labels.get(uid, UserLabel("unknown", 0.0, "unknown"))
    interactions = stats.get("comments", 0) + stats.get("reposts", 0) + stats.get("attitudes", 0)
    label_total = stats.get("fake", 0) + stats.get("real", 0)
    return {
        "id": f"u:{sha_short(uid)}",
        "kind": "actor",
        "name": sha_short(uid),
        "weight": max(1, interactions),
        "botLabel": label.bot_label,
        "botScore": round(label.bot_score, 4),
        "labelSource": label.label_source,
        "botShare": round(label.bot_score, 4),
        "fakeShare": round(stats.get("fake", 0) / label_total, 4) if label_total else 0.0,
    }


def build_graph_shard(
    row: dict[str, Any],
    event: dict[str, Any],
    actor_stats: dict[str, dict[str, Any]],
    labels: dict[str, UserLabel],
    args: argparse.Namespace,
) -> dict[str, Any]:
    comment_users = list(iter_user_ids(row.get("comment_users")))
    repost_users = list(iter_user_ids(row.get("repost_users")))
    attitude_users = list(iter_user_ids(row.get("attitude_users")))
    comment_set = set(comment_users)
    repost_set = set(repost_users)
    attitude_set = set(attitude_users)
    participant_counter = Counter(comment_users)
    participant_counter.update(repost_users)
    participant_counter.update(attitude_users)

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []
    visible_raw_users: set[str] = set()
    event_node_id = f"m:{event['id']}"
    nodes[event_node_id] = {
        "id": event_node_id,
        "kind": "microblog",
        "label": event["label"],
        "sourceType": event.get("sourceType"),
        "name": event["shortId"],
        "text": event.get("text", ""),
        "weight": max(1, event.get("score", 1)),
        "botShare": event.get("botShare", 0.0),
    }

    max_nodes = max(8, args.shard_max_nodes)
    max_edges = max(8, args.shard_max_edges)

    def add_actor(uid: Any) -> str | None:
        if uid in (None, ""):
            return None
        raw_uid = str(uid)
        node_id = f"u:{sha_short(raw_uid)}"
        if node_id not in nodes:
            if len(nodes) >= max_nodes:
                return None
            nodes[node_id] = actor_graph_node(raw_uid, actor_stats, labels)
        visible_raw_users.add(raw_uid)
        return node_id

    def add_edge(source: str | None, target: str | None, edge_type: str) -> bool:
        if not source or not target or source == target or len(edges) >= max_edges:
            return False
        edges.append({"source": source, "target": target, "type": edge_type})
        return True

    for uid, _ in participant_counter.most_common(args.shard_participants):
        node_id = add_actor(uid)
        if not node_id:
            continue
        if uid in repost_set:
            add_edge(node_id, event_node_id, "repost")
        if uid in comment_set:
            add_edge(node_id, event_node_id, "comment")
        if uid in attitude_set:
            add_edge(node_id, event_node_id, "attitude")

    repost_graph = row.get("repost_graph") if isinstance(row.get("repost_graph"), dict) else {}
    repost_nodes = repost_graph.get("nodes") or []
    for edge in repost_graph.get("edges") or []:
        if not isinstance(edge, list) or len(edge) < 2:
            continue
        source_index = safe_int(edge[0], -1)
        target_index = safe_int(edge[1], -1)
        if source_index < 0 or target_index < 0:
            continue
        if source_index >= len(repost_nodes) or target_index >= len(repost_nodes):
            continue
        source_uid = repost_nodes[source_index].get("name") if isinstance(repost_nodes[source_index], dict) else None
        target_uid = repost_nodes[target_index].get("name") if isinstance(repost_nodes[target_index], dict) else None
        source = add_actor(source_uid)
        target = add_actor(target_uid)
        add_edge(source, target, "repostCascade")

    for graph in row.get("comment_graphs") or []:
        if not isinstance(graph, dict):
            continue
        comment_nodes = graph.get("nodes") or []
        graph_edges = graph.get("edges") or []
        for edge in graph_edges:
            if not isinstance(edge, list) or len(edge) < 2:
                continue
            source_index = safe_int(edge[0], -1)
            target_index = safe_int(edge[1], -1)
            if source_index < 0 or target_index < 0:
                continue
            if source_index >= len(comment_nodes) or target_index >= len(comment_nodes):
                continue
            source_node = comment_nodes[source_index] if isinstance(comment_nodes[source_index], dict) else {}
            target_node = comment_nodes[target_index] if isinstance(comment_nodes[target_index], dict) else {}
            source = add_actor(source_node.get("user_from"))
            target = add_actor(target_node.get("user_from") or target_node.get("user_to"))
            add_edge(source, target, "commentReply")
        if not graph_edges:
            for comment_node in comment_nodes:
                if not isinstance(comment_node, dict) or not comment_node.get("user_to"):
                    continue
                source = add_actor(comment_node.get("user_from"))
                target = add_actor(comment_node.get("user_to"))
                add_edge(source, target, "commentReply")

    meta = graph_meta(row)
    total_possible_nodes = len(set(participant_counter) | visible_raw_users)
    total_possible_edges = (
        len(comment_users)
        + len(repost_users)
        + len(attitude_users)
        + meta["repostEdges"]
        + meta["commentEdges"]
    )
    return {
        "eventId": event["id"],
        "shortId": event["shortId"],
        "graph": {"nodes": list(nodes.values()), "edges": edges},
        "visibleNodes": len(nodes),
        "visibleEdges": len(edges),
        "omittedNodes": max(0, total_possible_nodes + 1 - len(nodes)),
        "omittedEdges": max(0, total_possible_edges - len(edges)),
        "selectionRule": "头部参与者与有界转发/评论级联边",
    }


def build_full_graph(
    row: dict[str, Any],
    event: dict[str, Any],
    actor_stats: dict[str, dict[str, Any]],
    labels: dict[str, UserLabel],
) -> dict[str, Any]:
    comment_users = list(iter_user_ids(row.get("comment_users")))
    repost_users = list(iter_user_ids(row.get("repost_users")))
    attitude_users = list(iter_user_ids(row.get("attitude_users")))
    comment_set = set(comment_users)
    repost_set = set(repost_users)
    attitude_set = set(attitude_users)
    participant_counter = Counter(comment_users)
    participant_counter.update(repost_users)
    participant_counter.update(attitude_users)

    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[tuple[str, str, str], dict[str, str]] = {}
    event_node_id = f"m:{event['id']}"
    nodes[event_node_id] = {
        "id": event_node_id,
        "kind": "microblog",
        "label": event["label"],
        "sourceType": event.get("sourceType"),
        "name": event["shortId"],
        "text": event.get("text", ""),
        "weight": max(1, event.get("score", 1)),
        "botShare": event.get("botShare", 0.0),
        "x": 480.0,
        "y": 280.0,
    }

    def add_actor(uid: Any) -> str | None:
        if uid in (None, ""):
            return None
        raw_uid = str(uid)
        node_id = f"u:{sha_short(raw_uid)}"
        if node_id not in nodes:
            node = actor_graph_node(raw_uid, actor_stats, labels)
            node["weight"] = max(1, participant_counter.get(raw_uid, node.get("weight", 1)))
            nodes[node_id] = node
        return node_id

    def add_edge(source: str | None, target: str | None, edge_type: str) -> None:
        if not source or not target or source == target:
            return
        key = (source, target, edge_type)
        edges.setdefault(key, {"source": source, "target": target, "type": edge_type})

    for uid in repost_set:
        add_edge(add_actor(uid), event_node_id, "repost")
    for uid in comment_set:
        add_edge(add_actor(uid), event_node_id, "comment")
    for uid in attitude_set:
        add_edge(add_actor(uid), event_node_id, "attitude")

    repost_graph = row.get("repost_graph") if isinstance(row.get("repost_graph"), dict) else {}
    repost_nodes = repost_graph.get("nodes") or []
    for edge in repost_graph.get("edges") or []:
        if not isinstance(edge, list) or len(edge) < 2:
            continue
        source_index = safe_int(edge[0], -1)
        target_index = safe_int(edge[1], -1)
        if source_index < 0 or target_index < 0:
            continue
        if source_index >= len(repost_nodes) or target_index >= len(repost_nodes):
            continue
        source_uid = repost_nodes[source_index].get("name") if isinstance(repost_nodes[source_index], dict) else None
        target_uid = repost_nodes[target_index].get("name") if isinstance(repost_nodes[target_index], dict) else None
        add_edge(add_actor(source_uid), add_actor(target_uid), "repostCascade")

    for graph in row.get("comment_graphs") or []:
        if not isinstance(graph, dict):
            continue
        comment_nodes = graph.get("nodes") or []
        graph_edges = graph.get("edges") or []
        for edge in graph_edges:
            if not isinstance(edge, list) or len(edge) < 2:
                continue
            source_index = safe_int(edge[0], -1)
            target_index = safe_int(edge[1], -1)
            if source_index < 0 or target_index < 0:
                continue
            if source_index >= len(comment_nodes) or target_index >= len(comment_nodes):
                continue
            source_node = comment_nodes[source_index] if isinstance(comment_nodes[source_index], dict) else {}
            target_node = comment_nodes[target_index] if isinstance(comment_nodes[target_index], dict) else {}
            source = add_actor(source_node.get("user_from"))
            target = add_actor(target_node.get("user_from") or target_node.get("user_to"))
            add_edge(source, target, "commentReply")
        if not graph_edges:
            for comment_node in comment_nodes:
                if not isinstance(comment_node, dict) or not comment_node.get("user_to"):
                    continue
                source = add_actor(comment_node.get("user_from"))
                target = add_actor(comment_node.get("user_to"))
                add_edge(source, target, "commentReply")

    apply_full_graph_layout(nodes, list(edges.values()), event_node_id)

    return {
        "eventId": event["id"],
        "shortId": event["shortId"],
        "graph": {"nodes": list(nodes.values()), "edges": list(edges.values())},
        "visibleNodes": len(nodes),
        "visibleEdges": len(edges),
        "omittedNodes": 0,
        "omittedEdges": 0,
        "selectionRule": "由本地 MisBot 原始记录预计算得到的完整事件传播图",
    }


def apply_full_graph_layout(nodes: dict[str, dict[str, Any]], edges: list[dict[str, str]], event_node_id: str) -> None:
    direct: dict[str, list[str]] = {"repost": [], "comment": [], "attitude": []}
    linked: set[str] = {event_node_id}
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        linked.add(source)
        linked.add(target)
        if target == event_node_id and edge["type"] in direct:
            direct[edge["type"]].append(source)

    ring_specs = [
        ("repost", 125.0, -0.15),
        ("comment", 230.0, 1.7),
        ("attitude", 335.0, 3.35),
    ]
    for edge_type, radius, offset in ring_specs:
        ids = sorted(set(direct[edge_type]))
        place_on_ring(nodes, ids, 480.0, 280.0, radius, offset)

    actor_ids = sorted(node_id for node_id in nodes if node_id.startswith("u:") and node_id not in linked)
    place_on_ring(nodes, actor_ids, 480.0, 280.0, 430.0, 0.7)

    # Actor-actor cascade/reply nodes are laid out in deterministic outer rings
    # when they were not already direct participants.
    remaining = [
        node_id
        for node_id, node in nodes.items()
        if node_id.startswith("u:") and ("x" not in node or "y" not in node)
    ]
    place_on_ring(nodes, remaining, 480.0, 280.0, 430.0, 2.2)


def place_on_ring(
    nodes: dict[str, dict[str, Any]],
    node_ids: list[str],
    center_x: float,
    center_y: float,
    radius: float,
    offset: float,
) -> None:
    total = max(1, len(node_ids))
    for index, node_id in enumerate(node_ids):
        angle = offset + (math.tau * index) / total
        nodes[node_id]["x"] = round(center_x + math.cos(angle) * radius, 3)
        nodes[node_id]["y"] = round(center_y + math.sin(angle) * radius * 0.72, 3)


def write_graph_shards(
    args: argparse.Namespace,
    info_root: Path,
    events_by_id: dict[str, dict[str, Any]],
    actor_stats: dict[str, dict[str, Any]],
    labels: dict[str, UserLabel],
    case_event_ids: list[str],
    shard_dir: Path,
) -> dict[str, dict[str, Any]]:
    wanted = set(case_event_ids)
    if not wanted:
        return {}
    shard_dir.mkdir(parents=True, exist_ok=True)
    shards: dict[str, dict[str, Any]] = {}

    for source_type, (filename, _label) in INFO_FILES.items():
        path = find_file(info_root, filename)
        if not path:
            continue
        for idx, row in enumerate(iter_jsonl(path)):
            article = row.get("article") if isinstance(row.get("article"), dict) else {}
            text_raw = get_first(article, "article_content", "text", "content", default="")
            publish_time = get_first(article, "publish_time", "date", "created_at", default="")
            event_id = hashlib.sha256(f"{source_type}:{idx}:{publish_time}:{text_raw}".encode("utf-8", "ignore")).hexdigest()
            if event_id not in wanted or event_id not in events_by_id:
                continue
            shard = build_graph_shard(row, events_by_id[event_id], actor_stats, labels, args)
            filename_out = f"{events_by_id[event_id]['shortId']}.json"
            shard["path"] = f"misbot_graph_shards/{filename_out}"
            with (shard_dir / filename_out).open("w", encoding="utf-8") as handle:
                json.dump(shard, handle, ensure_ascii=False, separators=(",", ":"))
                handle.write("\n")
            shards[event_id] = shard
            if len(shards) == len(wanted):
                return shards
    return shards


def write_full_graphs(
    args: argparse.Namespace,
    info_root: Path,
    events_by_id: dict[str, dict[str, Any]],
    actor_stats: dict[str, dict[str, Any]],
    labels: dict[str, UserLabel],
    graph_dir: Path,
    priority_event_ids: list[str] | None = None,
) -> dict[str, str]:
    if args.skip_full_graphs:
        return {}
    graph_dir.mkdir(parents=True, exist_ok=True)
    base_name = graph_dir.name
    graph_paths: dict[str, str] = {}
    target_events = select_full_graph_events(events_by_id, args.full_graph_limit, priority_event_ids or [])
    wanted = {event["id"] for event in target_events}
    expected_files = {f"{event['shortId']}.json" for event in target_events}
    prune_stale_full_graphs(graph_dir, expected_files)

    for source_type, (filename, _label) in INFO_FILES.items():
        path = find_file(info_root, filename)
        if not path:
            continue
        for idx, row in enumerate(iter_jsonl(path)):
            article = row.get("article") if isinstance(row.get("article"), dict) else {}
            text_raw = get_first(article, "article_content", "text", "content", default="")
            publish_time = get_first(article, "publish_time", "date", "created_at", default="")
            event_id = hashlib.sha256(f"{source_type}:{idx}:{publish_time}:{text_raw}".encode("utf-8", "ignore")).hexdigest()
            event = events_by_id.get(event_id)
            if not event or event_id not in wanted:
                continue
            graph = build_full_graph(row, event, actor_stats, labels)
            filename_out = f"{event['shortId']}.json"
            graph["path"] = f"{base_name}/{filename_out}"
            with (graph_dir / filename_out).open("w", encoding="utf-8") as handle:
                json.dump(graph, handle, ensure_ascii=False, separators=(",", ":"))
                handle.write("\n")
            graph_paths[event_id] = graph["path"]
            if len(graph_paths) == len(wanted):
                return graph_paths
    return graph_paths


def select_full_graph_events(
    events_by_id: dict[str, dict[str, Any]],
    limit: int,
    priority_event_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    events = sorted(
        events_by_id.values(),
        key=lambda event: (parse_datetime(event.get("date")) or datetime.min, event.get("id", "")),
        reverse=True,
    )
    prioritized = [
        events_by_id[event_id]
        for event_id in (priority_event_ids or [])
        if event_id in events_by_id
    ]
    ordered: list[dict[str, Any]] = []
    seen: set[str] = set()
    for event in prioritized + events:
        event_id = event.get("id")
        if not event_id or event_id in seen:
            continue
        seen.add(event_id)
        ordered.append(event)
    if limit <= 0:
        return ordered
    return ordered[:limit]


def prune_stale_full_graphs(graph_dir: Path, expected_files: set[str]) -> None:
    for path in graph_dir.glob("*.json"):
        if path.name not in expected_files:
            path.unlink()


def story_node_radius(node: dict[str, Any]) -> float:
    weight = max(1.0, safe_float(node.get("weight"), 1.0))
    if node.get("kind") == "microblog":
        return max(16.0, min(36.0, math.sqrt(weight) * 0.42))
    return max(4.5, min(13.0, math.sqrt(weight) * 0.22))


def story_edge_control(
    source: dict[str, Any],
    target: dict[str, Any],
    edge_type: str,
) -> tuple[float, float]:
    dx = target["x"] - source["x"]
    dy = target["y"] - source["y"]
    distance = max(1.0, math.hypot(dx, dy))
    sign = 1 if int(sha_short(f"{source['id']}:{target['id']}:{edge_type}", 2), 16) % 2 else -1
    bend = sign * min(120.0, max(20.0, distance * 0.18))
    nx = -dy / distance
    ny = dx / distance
    return (source["x"] + target["x"]) / 2 + nx * bend, (source["y"] + target["y"]) / 2 + ny * bend


def story_bounds(nodes: list[dict[str, Any]]) -> dict[str, float]:
    if not nodes:
        return {"minX": -1, "minY": -1, "maxX": 1, "maxY": 1}
    return {
        "minX": min(node["x"] - node["r"] for node in nodes),
        "minY": min(node["y"] - node["r"] for node in nodes),
        "maxX": max(node["x"] + node["r"] for node in nodes),
        "maxY": max(node["y"] + node["r"] for node in nodes),
    }


def story_focus_region(
    *,
    region_id: str,
    label: str,
    node_ids: list[str],
    event_ids: list[str],
    nodes_by_id: dict[str, dict[str, Any]],
    bounds: dict[str, float],
    scale: float,
    label_filter: str = "all",
    bot_heavy: bool = False,
    search: str = "",
    date_range: dict[str, str] | None = None,
    selected_event_id: str | None = None,
    selected_actor_id: str | None = None,
    orbit_phase: float | None = None,
    summary: str = "",
) -> dict[str, Any]:
    selected = [nodes_by_id[node_id] for node_id in node_ids if node_id in nodes_by_id]
    box = story_bounds(selected) if selected else bounds
    region: dict[str, Any] = {
        "id": region_id,
        "label": label,
        "centerX": round((box["minX"] + box["maxX"]) / 2, 3),
        "centerY": round((box["minY"] + box["maxY"]) / 2, 3),
        "scale": scale,
        "nodeIds": node_ids,
        "eventIds": event_ids,
        "labelFilter": label_filter,
        "botHeavy": bot_heavy,
        "search": search,
        "summary": summary,
    }
    if date_range:
        region["dateRange"] = date_range
    if selected_event_id:
        region["selectedEventId"] = selected_event_id
    if selected_actor_id:
        region["selectedActorId"] = selected_actor_id
    if orbit_phase is not None:
        region["orbitPhase"] = orbit_phase
    return region


def story_neighbor_ids(node_id: str | None, edges: list[dict[str, Any]]) -> list[str]:
    if not node_id:
        return []
    ids = {node_id}
    for edge in edges:
        if edge.get("source") == node_id:
            ids.add(edge.get("target"))
        if edge.get("target") == node_id:
            ids.add(edge.get("source"))
    return [node_id for node_id in ids if node_id]


def story_hub_score(actor: dict[str, Any]) -> float:
    activity = (
        safe_int(actor.get("comments"), 0)
        + safe_int(actor.get("reposts"), 0)
        + safe_int(actor.get("attitudes"), 0)
    )
    return (
        safe_float(actor.get("fakeShare"), 0.0) * 3.0
        + safe_float(actor.get("botScore"), 0.0) * 2.4
        + math.log1p(activity) / 5.0
        + math.log1p(safe_int(actor.get("eventCount"), 0)) / 5.0
    )


def build_story_network(
    case_shards: list[dict[str, Any]],
    burst_windows: list[dict[str, Any]],
    template_signals: list[dict[str, Any]],
    hub_actors: list[dict[str, Any]],
    events_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    nodes_by_id: dict[str, dict[str, Any]] = {}
    event_story_ids: dict[str, str] = {}
    actor_story_ids: dict[str, str] = {}
    cluster_node_ids: dict[str, list[str]] = {}
    shards = case_shards[:8]

    if not shards:
        return {
            "nodes": [],
            "edges": [],
            "focusRegions": [],
            "bounds": {"minX": -1, "minY": -1, "maxX": 1, "maxY": 1},
            "selectionRule": "没有可用叙事图分片",
        }

    graph_radius = max(600.0, min(980.0, 420.0 + len(shards) * 80.0))
    golden_angle = math.pi * (3 - math.sqrt(5))

    for shard_index, shard in enumerate(shards):
        angle = 0 if len(shards) == 1 else (math.pi * 2 * shard_index / len(shards)) - math.pi / 2
        center_x = math.cos(angle) * graph_radius
        center_y = math.sin(angle) * graph_radius * 0.72
        cluster = f"cluster-{shard_index + 1}"
        cluster_node_ids[cluster] = []
        raw_nodes = sorted(
            shard["graph"]["nodes"],
            key=lambda node: (0 if node.get("kind") == "microblog" else 1, -safe_float(node.get("weight"), 0)),
        )
        raw_to_story: dict[str, str] = {}

        for node_index, node in enumerate(raw_nodes):
            raw_id = node["id"]
            story_id = f"story:{shard_index}:{raw_id}"
            if node.get("kind") == "microblog":
                x = center_x
                y = center_y
                event_id = raw_id[2:] if raw_id.startswith("m:") else shard.get("eventId")
            else:
                local_index = max(0, node_index - 1)
                ring = 78 + math.sqrt(local_index) * 38
                theta = local_index * golden_angle
                x = center_x + math.cos(theta) * ring
                y = center_y + math.sin(theta) * ring * 0.78
                event_id = None

            story_node = {
                "id": story_id,
                "refId": raw_id,
                "kind": node.get("kind", "actor"),
                "x": round(x, 3),
                "y": round(y, 3),
                "r": round(story_node_radius(node), 3),
                "cluster": cluster,
                "label": node.get("label"),
                "name": node.get("name"),
                "weight": node.get("weight", 1),
                "eventId": event_id,
                "botShare": node.get("botShare"),
                "fakeShare": node.get("fakeShare"),
            }
            nodes.append(story_node)
            nodes_by_id[story_id] = story_node
            raw_to_story[raw_id] = story_id
            cluster_node_ids[cluster].append(story_id)
            if event_id:
                event_story_ids[event_id] = story_id
            if raw_id.startswith("u:"):
                actor_story_ids[raw_id] = story_id
                actor_story_ids[raw_id[2:]] = story_id

        for edge in shard["graph"]["edges"]:
            source = raw_to_story.get(edge.get("source"))
            target = raw_to_story.get(edge.get("target"))
            if not source or not target:
                continue
            c1x, c1y = story_edge_control(nodes_by_id[source], nodes_by_id[target], edge.get("type", "repost"))
            edges.append(
                {
                    "source": source,
                    "target": target,
                    "type": edge.get("type", "repost"),
                    "cluster": cluster,
                    "c1x": round(c1x, 3),
                    "c1y": round(c1y, 3),
                }
            )

    bounds = story_bounds(nodes)
    first_burst = burst_windows[0] if burst_windows else None
    first_template = template_signals[0] if template_signals else None
    overview_ids = [node["id"] for node in nodes]
    event_nodes = [node for node in nodes if node.get("eventId")]
    fake_node_ids = [node["id"] for node in nodes if node.get("label") == "fake"]
    burst_node_ids = [
        event_story_ids[event_id]
        for event_id in (first_burst or {}).get("eventIds", [])
        if event_id in event_story_ids
    ]
    template_node_ids = [
        event_story_ids[event_id]
        for event_id in (first_template or {}).get("eventIds", [])
        if event_id in event_story_ids
    ]
    def expanded_event_focus(event_ids: list[str], include_cluster: bool = False) -> list[str]:
        expanded: list[str] = []
        for event_id in event_ids:
            event_node_id = event_story_ids.get(event_id)
            if not event_node_id:
                continue
            expanded.extend(story_neighbor_ids(event_node_id, edges))
            if include_cluster:
                expanded.extend(cluster_node_ids.get(nodes_by_id[event_node_id].get("cluster"), []))
        seen: set[str] = set()
        ordered: list[str] = []
        for node_id in expanded:
            if node_id and node_id not in seen:
                seen.add(node_id)
                ordered.append(node_id)
        return ordered
    burst_focus_ids = expanded_event_focus((first_burst or {}).get("eventIds", []), include_cluster=True)
    template_focus_ids = expanded_event_focus((first_template or {}).get("eventIds", []), include_cluster=True)
    bot_node_ids = [
        node["id"]
        for node in nodes
        if safe_float(node.get("botShare"), 0) >= 0.25 or (node.get("kind") == "actor" and safe_float(node.get("fakeShare"), 0) >= 0.5)
    ]
    selected_hub = next(
        (
            actor
            for actor in sorted(hub_actors, key=story_hub_score, reverse=True)
            if actor_story_ids.get(actor.get("user", "")) or any(event_id in event_story_ids for event_id in actor.get("topEventIds", []))
        ),
        None,
    )
    selected_hub_node_id = actor_story_ids.get((selected_hub or {}).get("user", "")) if selected_hub else None
    selected_hub_ref_id = nodes_by_id[selected_hub_node_id]["refId"] if selected_hub_node_id else None
    selected_hub_event_id = None
    if selected_hub:
        selected_hub_event_id = next(
            (event_id for event_id in selected_hub.get("topEventIds", []) if event_id in event_story_ids),
            None,
        )
    selected_hub_cluster_ids: list[str] = []
    if selected_hub_node_id:
        selected_hub_cluster = nodes_by_id[selected_hub_node_id].get("cluster")
        selected_hub_cluster_ids = cluster_node_ids.get(selected_hub_cluster, [])
        if not selected_hub_event_id:
            selected_hub_event_id = next(
                (
                    nodes_by_id[node_id].get("eventId")
                    for node_id in selected_hub_cluster_ids
                    if nodes_by_id[node_id].get("eventId")
                ),
                None,
            )
    selected_hub_event_node_id = event_story_ids.get(selected_hub_event_id or "")
    ringleader_ids = set(story_neighbor_ids(selected_hub_node_id, edges))
    ringleader_ids.update(story_neighbor_ids(selected_hub_event_node_id, edges))
    ringleader_ids.update(selected_hub_cluster_ids)
    if selected_hub_node_id:
        ringleader_ids.add(selected_hub_node_id)
    if selected_hub_event_node_id:
        ringleader_ids.add(selected_hub_event_node_id)
    selected_event_id = None
    if first_burst:
        selected_event_id = next((event_id for event_id in first_burst.get("eventIds", []) if event_id in event_story_ids), None)
    selected_event_id = selected_event_id or next((node.get("eventId") for node in event_nodes if node.get("label") == "fake"), None)
    selected_node_id = event_story_ids.get(selected_event_id or "")
    evidence_ids = {selected_node_id} if selected_node_id else set()
    for edge in edges:
        if edge["source"] == selected_node_id:
            evidence_ids.add(edge["target"])
        if edge["target"] == selected_node_id:
            evidence_ids.add(edge["source"])

    burst_range = None
    if first_burst:
        burst_range = {"start": f"{first_burst['startMonth']}-01", "end": f"{first_burst['endMonth']}-28"}

    focus_regions = [
        story_focus_region(
            region_id="overview",
            label="全部有界叙事分片",
            node_ids=overview_ids,
            event_ids=[node["eventId"] for node in event_nodes if node.get("eventId")],
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=0.82,
            orbit_phase=0,
            summary="叙事从完整有界审计投影打开。",
        ),
        story_focus_region(
            region_id="fake-burst",
            label=f"虚假突发 {first_burst['peakMonth']}" if first_burst else "虚假信息突发",
            node_ids=burst_focus_ids or burst_node_ids or fake_node_ids,
            event_ids=(first_burst or {}).get("eventIds", []),
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=1.35,
            label_filter="fake",
            date_range=burst_range,
            selected_event_id=selected_event_id,
            orbit_phase=0.25,
            summary="第一段跳转隔离虚假信息占比最高的突发窗口。",
        ),
        story_focus_region(
            region_id="propagation-core",
            label="扩散核心",
            node_ids=cluster_node_ids.get("cluster-1", overview_ids),
            event_ids=[shards[0].get("eventId")] if shards else [],
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=1.75,
            label_filter="fake",
            selected_event_id=shards[0].get("eventId") if shards else None,
            orbit_phase=0.42,
            summary="镜头进入一条有界转发/评论级联。",
        ),
        story_focus_region(
            region_id="template-cluster",
            label="重复话术簇",
            node_ids=template_focus_ids or template_node_ids or burst_focus_ids or burst_node_ids,
            event_ids=(first_template or {}).get("eventIds", []),
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=1.85,
            label_filter="fake",
            search=(first_template or {}).get("text", ""),
            selected_event_id=next((event_id for event_id in (first_template or {}).get("eventIds", []) if event_id in event_story_ids), None),
            orbit_phase=0.58,
            summary="重复话术被纳入空间焦点，而不是单独陈列。",
        ),
        story_focus_region(
            region_id="ringleader-hunt",
            label=f"组织者候选 {(selected_hub or {}).get('user', '')}" if selected_hub else "组织者候选",
            node_ids=[node_id for node_id in ringleader_ids if node_id] or bot_node_ids or burst_node_ids,
            event_ids=[selected_hub_event_id] if selected_hub_event_id else [],
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=1.95,
            label_filter="fake",
            bot_heavy=True,
            selected_event_id=selected_hub_event_id,
            selected_actor_id=selected_hub_ref_id,
            orbit_phase=0.68,
            summary="从水军代理分数、虚假参与占比与一跳邻域锁定疑似放大者。",
        ),
        story_focus_region(
            region_id="bot-heavy",
            label="水军高占比参与",
            node_ids=bot_node_ids or burst_node_ids,
            event_ids=[node.get("eventId") for node in nodes if node["id"] in bot_node_ids and node.get("eventId")],
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=1.55,
            label_filter="fake",
            bot_heavy=True,
            date_range=burst_range,
            selected_event_id=selected_event_id,
            orbit_phase=0.72,
            summary="高水军代理参与被高亮，但不会被转化为定罪判断。",
        ),
        story_focus_region(
            region_id="evidence-focus",
            label="证据细读",
            node_ids=[node_id for node_id in evidence_ids if node_id],
            event_ids=[selected_event_id] if selected_event_id else [],
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=2.25,
            label_filter="fake",
            bot_heavy=True,
            selected_event_id=selected_event_id,
            orbit_phase=0.92,
            summary="最后一步落到一条匿名微博及其局部邻域。",
        ),
        story_focus_region(
            region_id="limits",
            label="审计边界",
            node_ids=overview_ids,
            event_ids=[node["eventId"] for node in event_nodes if node.get("eventId")],
            nodes_by_id=nodes_by_id,
            bounds=bounds,
            scale=0.95,
            orbit_phase=1,
            summary="叙事拉远，提醒分析者拓扑只是证据，不是裁决。",
        ),
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "focusRegions": focus_regions,
        "bounds": bounds,
        "selectionRule": "由有界图分片预计算得到的叙事投影",
    }


def build_dashboard(args: argparse.Namespace) -> dict[str, Any]:
    raw_root = Path(args.raw)
    info_root = raw_root / "Information_Instances" if (raw_root / "Information_Instances").exists() else raw_root
    user_root = raw_root / "User_Instances" if (raw_root / "User_Instances").exists() else raw_root

    missing = [filename for filename, _ in INFO_FILES.values() if not find_file(info_root, filename)]
    if missing:
        expected = "\n".join(f"  - Information_Instances/{name}" for name in missing)
        raise SystemExit(
            f"{raw_root} 下缺少 MisBot 信息文件：\n{expected}\n"
            "请先下载并解压 MisBot 到 data/raw/misbot，再重新构建。"
        )

    user_labels = load_user_labels(user_root)
    if not user_labels:
        print(
            "警告：没有找到 MisBot 用户标签；水军信号将标记为未知",
            file=sys.stderr,
        )

    events_all: list[dict[str, Any]] = []
    event_private: dict[str, dict[str, Any]] = {}
    keyword_counts: dict[str, Counter[str]] = defaultdict(Counter)
    keyword_counts_by_month: dict[str, Counter[str]] = defaultdict(Counter)
    phrase_counts: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "users": set(), "bot_users": set(), "known_users": set()})
    phrase_event_ids: dict[str, list[str]] = defaultdict(list)
    timeline_counts: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "fake": 0,
            "real": 0,
            "comments": 0,
            "reposts": 0,
            "attitudes": 0,
            "bot_users": set(),
            "human_users": set(),
            "unknown_users": set(),
        }
    )
    actor_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "comments": 0,
            "reposts": 0,
            "attitudes": 0,
            "fake": 0,
            "real": 0,
            "events": 0,
            "fake_events": 0,
            "real_events": 0,
            "top_event_id": "",
            "top_event_score": -1,
            "top_events": [],
        }
    )
    event_graph_index: list[dict[str, Any]] = []
    all_participants: set[str] = set()
    date_values: list[datetime] = []
    global_counts = Counter()

    for source_type, (filename, label) in INFO_FILES.items():
        path = find_file(info_root, filename)
        if not path:
            continue
        for idx, row in enumerate(iter_jsonl(path)):
            if args.limit_events is not None and len(events_all) >= args.limit_events:
                break
            article = row.get("article") if isinstance(row.get("article"), dict) else {}
            text_raw = get_first(article, "article_content", "text", "content", default="")
            publish_time = get_first(article, "publish_time", "date", "created_at", default="")
            parsed_date = parse_datetime(publish_time)
            if parsed_date:
                date_values.append(parsed_date)

            comment_users = list(iter_user_ids(row.get("comment_users")))
            repost_users = list(iter_user_ids(row.get("repost_users")))
            attitude_users = list(iter_user_ids(row.get("attitude_users")))
            participant_counter = Counter(comment_users)
            participant_counter.update(repost_users)
            participant_counter.update(attitude_users)
            participants = set(participant_counter)
            all_participants.update(participants)

            comment_count = safe_int(get_first(article, "comment_count", "comment_num"), len(comment_users))
            repost_count = safe_int(get_first(article, "repost_count", "repost_num"), len(repost_users))
            attitude_count = safe_int(get_first(article, "attitude_count", "attitude_num", "like_count", "like_num"), len(attitude_users))
            if comment_count == 0:
                comment_count = len(comment_users)
            if repost_count == 0:
                repost_count = len(repost_users)
            if attitude_count == 0:
                attitude_count = len(attitude_users)

            bot_count, human_count, unknown_count, bot_share = label_counts(participants, user_labels)
            event_id = hashlib.sha256(f"{source_type}:{idx}:{publish_time}:{text_raw}".encode("utf-8", "ignore")).hexdigest()
            tags = re.findall(r"#([^#\n\r]{2,40})#", str(text_raw or ""))[:8]
            terms = extract_terms(str(text_raw or ""))
            score = comment_count + repost_count + attitude_count
            publisher = get_first(article, "uid", "user_id", "userid", "user", "id", default=f"{source_type}:{idx}")
            month = month_key(parsed_date)
            graph_summary = graph_meta(row)
            repost_graph = row.get("repost_graph") if isinstance(row.get("repost_graph"), dict) else {}

            event = {
                "id": event_id,
                "shortId": event_id[:8],
                "label": label,
                "sourceType": source_type,
                "date": format_date(parsed_date),
                "month": month,
                "user": sha_short(publisher),
                "text": truncate_text(text_raw, args.text_limit),
                "analysis": "",
                "commentCount": comment_count,
                "repostCount": repost_count,
                "attitudeCount": attitude_count,
                "likeCount": attitude_count,
                "declaredComments": comment_count,
                "declaredReposts": repost_count,
                "tags": tags,
                "keywords": terms[:5],
                "botUserCount": bot_count,
                "humanUserCount": human_count,
                "unknownUserCount": unknown_count,
                "knownUserCount": bot_count + human_count,
                "botShare": round(bot_share, 4),
                "score": score,
            }
            events_all.append(event)
            event_graph_index.append(
                {
                    "eventId": event_id,
                    "shortId": event_id[:8],
                    "label": label,
                    "sourceType": source_type,
                    "date": event["date"],
                    "month": month,
                    "participantCount": len(participants),
                    "knownUserCount": bot_count + human_count,
                    "botShare": round(bot_share, 4),
                    "repostEdges": graph_summary["repostEdges"],
                    "commentEdges": graph_summary["commentEdges"],
                    "cascadeEdges": graph_summary["cascadeEdges"],
                    "cascadeDepth": max_tree_depth(repost_graph.get("edges") or []),
                    "score": score,
                }
            )
            event_private[event_id] = {
                "comment_users": comment_users,
                "repost_users": repost_users,
                "attitude_users": attitude_users,
                "participant_counter": participant_counter,
            }

            global_counts["informationInstances"] += 1
            global_counts[label] += 1
            global_counts["comments"] += comment_count
            global_counts["reposts"] += repost_count
            global_counts["attitudes"] += attitude_count

            timeline_counts[month][label] += 1
            timeline_counts[month]["comments"] += comment_count
            timeline_counts[month]["reposts"] += repost_count
            timeline_counts[month]["attitudes"] += attitude_count

            for uid in participants:
                user_label = user_labels.get(uid)
                if not user_label:
                    timeline_counts[month]["unknown_users"].add(uid)
                elif user_label.bot_label == "bot":
                    timeline_counts[month]["bot_users"].add(uid)
                else:
                    timeline_counts[month]["human_users"].add(uid)

            for uid, count in Counter(comment_users).items():
                actor_stats[uid]["comments"] += count
                actor_stats[uid][label] += count
            for uid, count in Counter(repost_users).items():
                actor_stats[uid]["reposts"] += count
                actor_stats[uid][label] += count
            for uid, count in Counter(attitude_users).items():
                actor_stats[uid]["attitudes"] += count
                actor_stats[uid][label] += count

            for uid in participants:
                actor_stats[uid]["events"] += 1
                actor_stats[uid][f"{label}_events"] += 1
                remember_actor_event(actor_stats[uid], event_id, score)
                if score > actor_stats[uid]["top_event_score"]:
                    actor_stats[uid]["top_event_score"] = score
                    actor_stats[uid]["top_event_id"] = event_id

            for term in terms:
                keyword_counts[term][label] += 1
                keyword_counts_by_month[month][term] += 1
            for phrase in extract_phrases(str(text_raw or "")):
                stats = phrase_counts[phrase]
                stats["count"] += 1
                stats["users"].update(participants)
                if len(phrase_event_ids[phrase]) < 24:
                    phrase_event_ids[phrase].append(event_id)
                for uid in participants:
                    label_info = user_labels.get(uid)
                    if label_info:
                        stats["known_users"].add(uid)
                        if label_info.bot_label == "bot":
                            stats["bot_users"].add(uid)
        if args.limit_events is not None and len(events_all) >= args.limit_events:
            break

    events_all.sort(key=lambda event: (event["score"], event["botShare"]), reverse=True)
    events = events_all

    actors = sorted(
        (actor_summary(uid, stats, user_labels) for uid, stats in actor_stats.items()),
        key=lambda actor: (actor["score"], actor["comments"] + actor["reposts"] + actor["attitudes"]),
        reverse=True,
    )[: args.max_actors]
    hub_actors = actors[: args.max_hubs]

    known_participants = [uid for uid in all_participants if uid in user_labels]
    bot_actors = sum(1 for uid in known_participants if user_labels[uid].bot_label == "bot")
    human_actors = sum(1 for uid in known_participants if user_labels[uid].bot_label == "human")
    unknown_actors = len(all_participants) - len(known_participants)
    bot_share = bot_actors / (bot_actors + human_actors) if (bot_actors + human_actors) else 0.0

    timeline = []
    for month in sorted(timeline_counts):
        row = timeline_counts[month]
        bots = len(row["bot_users"])
        humans = len(row["human_users"])
        known = bots + humans
        timeline.append(
            {
                "month": month,
                "fake": row["fake"],
                "real": row["real"],
                "comments": row["comments"],
                "reposts": row["reposts"],
                "attitudes": row["attitudes"],
                "botUsers": bots,
                "humanUsers": humans,
                "unknownUsers": len(row["unknown_users"]),
                "botShare": round(bots / known, 4) if known else 0.0,
            }
        )

    keywords = [
        {"keyword": term, "fake": counts["fake"], "real": counts["real"], "total": counts["fake"] + counts["real"]}
        for term, counts in keyword_counts.items()
    ]
    keywords.sort(key=lambda row: row["total"], reverse=True)

    phrases = []
    for phrase, stats in phrase_counts.items():
        known = len(stats["known_users"])
        bots = len(stats["bot_users"])
        phrases.append(
            {
                "text": phrase,
                "count": stats["count"],
                "users": len(stats["users"]),
                "botUsers": bots,
                "botShare": round(bots / known, 4) if known else 0.0,
            }
        )
    phrases.sort(key=lambda row: (row["count"], row["botShare"]), reverse=True)

    burst_windows = build_burst_windows(timeline, events, keyword_counts_by_month, args.max_bursts)
    template_signals = build_template_signals(phrases, phrase_event_ids, args.max_templates)
    case_event_ids = choose_case_event_ids(events, burst_windows, template_signals, hub_actors, args.max_shards)
    events_by_id = {event["id"]: event for event in events}
    full_graph_dir = Path(args.full_graph_dir) if args.full_graph_dir else Path(args.out).parent / "misbot_full_graphs"
    full_graph_paths = write_full_graphs(
        args=args,
        info_root=info_root,
        events_by_id=events_by_id,
        actor_stats=actor_stats,
        labels=user_labels,
        graph_dir=full_graph_dir,
        priority_event_ids=case_event_ids,
    )
    shard_dir = Path(args.shard_dir) if args.shard_dir else Path(args.out).parent / "misbot_graph_shards"
    shards = write_graph_shards(
        args=args,
        info_root=info_root,
        events_by_id=events_by_id,
        actor_stats=actor_stats,
        labels=user_labels,
        case_event_ids=case_event_ids,
        shard_dir=shard_dir,
    )
    for entry in event_graph_index:
        full_graph_path = full_graph_paths.get(entry["eventId"])
        if full_graph_path:
            entry["fullGraph"] = full_graph_path
        entry.pop("shard", None)
    event_graph_index.sort(key=lambda row: (row["score"], row["botShare"], row["cascadeEdges"]), reverse=True)
    case_graphs = [shards[event_id] for event_id in case_event_ids if event_id in shards][: args.inline_case_graphs]
    story_network = build_story_network(
        [shards[event_id] for event_id in case_event_ids if event_id in shards],
        burst_windows,
        template_signals,
        hub_actors,
        events_by_id,
    )
    default_case_graph = max(
        case_graphs,
        key=lambda shard: (shard["visibleEdges"], shard["visibleNodes"]),
        default=None,
    )
    default_graph = default_case_graph["graph"] if default_case_graph else {"nodes": [], "edges": []}

    return {
        "source": {
            "name": "MisBot：微博虚假信息与社交水军参与数据集",
            "repository": "https://github.com/whr000001/MisBot",
            "paper": "https://arxiv.org/abs/2408.09613",
            "note": "仅输出短哈希 ID 与截断文本。弱监督水军标签只是代理信号，不构成账号指控。",
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "stats": {
            "informationInstances": global_counts["informationInstances"],
            "microblogs": global_counts["informationInstances"],
            "fake": global_counts["fake"],
            "real": global_counts["real"],
            "comments": global_counts["comments"],
            "reposts": global_counts["reposts"],
            "attitudes": global_counts["attitudes"],
            "actors": len(all_participants),
            "botActors": bot_actors,
            "humanActors": human_actors,
            "unknownActors": unknown_actors,
            "botShare": round(bot_share, 4),
            "dateStart": format_date(min(date_values)) if date_values else "",
            "dateEnd": format_date(max(date_values)) if date_values else "",
        },
        "timeline": timeline,
        "keywords": keywords[: args.max_keywords],
        "events": events,
        "actors": actors,
        "phrases": phrases[: args.max_phrases],
        "coordination": {
            "summary": {
                "fullCoverage": True,
                "eventCount": len(events),
                "actorUniverse": len(all_participants),
                "visibleGraphPolicy": "分析台图文件优先覆盖滚动叙事案例，再用按发布时间倒序的 MisBot 事件补足；更早选择会从本地原始记录按需计算。",
                "shardBasePath": "misbot_graph_shards",
                "shardCount": len(shards),
                "fullGraphBasePath": full_graph_dir.name,
                "fullGraphCount": len(full_graph_paths),
                "fullGraphLimit": args.full_graph_limit,
                "fullGraphSelection": "priority_story_cases_then_latest_by_publish_date",
            },
            "burstWindows": burst_windows,
            "hubActors": hub_actors,
            "templateSignals": template_signals,
            "eventGraphIndex": event_graph_index,
            "caseGraphs": case_graphs,
            "storyNetwork": story_network,
            "tailSummary": {
                "keywordRowsTotal": len(keywords),
                "phraseRowsTotal": len(phrases),
                "actorRowsRanked": len(actor_stats),
                "keywordsEmitted": min(len(keywords), args.max_keywords),
                "phrasesEmitted": min(len(phrases), args.max_phrases),
                "actorsEmitted": len(actors),
            },
        },
        "graph": default_graph,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="从本地 MisBot 原始数据构建 public/data/misbot_dashboard.json。")
    parser.add_argument("--raw", default="data/raw/misbot", help="已解压的 MisBot 原始数据目录。")
    parser.add_argument("--out", default="public/data/misbot_dashboard.json", help="输出看板 JSON 路径。")
    parser.add_argument("--limit-events", type=int, default=None, help="仅调试：处理 N 条信息实例后停止，而不是覆盖完整 MisBot。")
    parser.add_argument("--shard-dir", default="", help="生成图分片的目录。默认使用 <out-dir>/misbot_graph_shards。")
    parser.add_argument("--full-graph-dir", default="", help="完整单事件图文件目录。默认使用 <out-dir>/misbot_full_graphs。")
    parser.add_argument("--skip-full-graphs", action="store_true", help="不写入完整单事件图文件。")
    parser.add_argument("--full-graph-limit", type=int, default=10_000, help="按发布时间预计算的最新事件完整图数量上限。使用 0 表示写入全部事件。")
    parser.add_argument("--text-limit", type=int, default=280, help="证据文本最大长度。")
    parser.add_argument("--max-actors", type=int, default=2000, help="写入看板 JSON 的参与者排序行数上限。")
    parser.add_argument("--max-hubs", type=int, default=80, help="写入的协同枢纽候选数量上限。")
    parser.add_argument("--max-keywords", type=int, default=800, help="写入看板 JSON 的关键词行数上限。")
    parser.add_argument("--max-phrases", type=int, default=800, help="写入看板 JSON 的重复话术行数上限。")
    parser.add_argument("--max-templates", type=int, default=120, help="写入 coordination 的话术模板信号数量上限。")
    parser.add_argument("--max-bursts", type=int, default=18, help="写入 coordination 的突发窗口排序数量上限。")
    parser.add_argument("--max-shards", type=int, default=36, help="为头部案例事件写入的图分片数量上限。")
    parser.add_argument("--inline-case-graphs", type=int, default=4, help="同时嵌入主 JSON 的生成分片数量。")
    parser.add_argument("--shard-participants", type=int, default=96, help="每个图分片中的头部参与者节点数量上限。")
    parser.add_argument("--shard-max-nodes", type=int, default=160, help="每个图分片的可见节点数量上限。")
    parser.add_argument("--shard-max-edges", type=int, default=260, help="每个图分片的可见边数量上限。")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dashboard = build_dashboard(args)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        json.dump(dashboard, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(
        f"已写入 {out}：{len(dashboard['events'])} 个事件，"
        f"{len(dashboard['actors'])} 行参与者，"
        f"{dashboard.get('coordination', {}).get('summary', {}).get('fullGraphCount', 0)} 个完整图"
    )


if __name__ == "__main__":
    main()
