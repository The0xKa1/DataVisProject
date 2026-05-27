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
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("T", " ").replace("Z", "+0000")
    if re.fullmatch(r"\d{10,13}", text):
        stamp = int(text)
        if stamp > 10_000_000_000:
            stamp //= 1000
        return datetime.fromtimestamp(stamp)
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
    return {
        "user": sha_short(uid),
        "comments": stats["comments"],
        "reposts": stats["reposts"],
        "attitudes": stats["attitudes"],
        "fake": stats["fake"],
        "real": stats["real"],
        "botLabel": label.bot_label,
        "botScore": round(label.bot_score, 4),
        "labelSource": label.label_source,
        "score": total + label.bot_score * 10,
    }


def build_dashboard(args: argparse.Namespace) -> dict[str, Any]:
    raw_root = Path(args.raw)
    info_root = raw_root / "Information_Instances" if (raw_root / "Information_Instances").exists() else raw_root
    user_root = raw_root / "User_Instances" if (raw_root / "User_Instances").exists() else raw_root

    missing = [filename for filename, _ in INFO_FILES.values() if not find_file(info_root, filename)]
    if missing:
        expected = "\n".join(f"  - Information_Instances/{name}" for name in missing)
        raise SystemExit(
            f"Missing MisBot information files under {raw_root}:\n{expected}\n"
            "Download and unpack MisBot into data/raw/misbot before building."
        )

    user_labels = load_user_labels(user_root)
    if not user_labels:
        print(
            "warning: no MisBot user labels found; bot signals will be marked unknown",
            file=sys.stderr,
        )

    events_all: list[dict[str, Any]] = []
    event_private: dict[str, dict[str, Any]] = {}
    keyword_counts: dict[str, Counter[str]] = defaultdict(Counter)
    phrase_counts: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "users": set(), "bot_users": set(), "known_users": set()})
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
    actor_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"comments": 0, "reposts": 0, "attitudes": 0, "fake": 0, "real": 0})
    all_participants: set[str] = set()
    date_values: list[datetime] = []
    global_counts = Counter()

    for source_type, (filename, label) in INFO_FILES.items():
        path = find_file(info_root, filename)
        if not path:
            continue
        for idx, row in enumerate(iter_jsonl(path)):
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

            event = {
                "id": event_id,
                "shortId": event_id[:8],
                "label": label,
                "sourceType": source_type,
                "date": format_date(parsed_date),
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

            month = month_key(parsed_date)
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

            for term in terms:
                keyword_counts[term][label] += 1
            for phrase in extract_phrases(str(text_raw or "")):
                stats = phrase_counts[phrase]
                stats["count"] += 1
                stats["users"].update(participants)
                for uid in participants:
                    label_info = user_labels.get(uid)
                    if label_info:
                        stats["known_users"].add(uid)
                        if label_info.bot_label == "bot":
                            stats["bot_users"].add(uid)

    events_all.sort(key=lambda event: (event["score"], event["botShare"]), reverse=True)
    fake_events = [event for event in events_all if event["label"] == "fake"][: args.per_label]
    real_events = [event for event in events_all if event["label"] == "real"][: args.per_label]
    selected_ids = {event["id"] for event in fake_events + real_events}
    deficit = max(0, args.sample_size - len(selected_ids))
    filler = [event for event in events_all if event["id"] not in selected_ids][:deficit]
    events = sorted(fake_events + real_events + filler, key=lambda event: (event["score"], event["botShare"]), reverse=True)

    actors = sorted(
        (actor_summary(uid, stats, user_labels) for uid, stats in actor_stats.items()),
        key=lambda actor: (actor["comments"] + actor["reposts"] + actor["attitudes"], actor["botScore"]),
        reverse=True,
    )[: args.max_actors]

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

    event_lookup = {event["id"]: event for event in events}
    actor_lookup = {actor["user"]: actor for actor in actors}
    graph_nodes: dict[str, dict[str, Any]] = {}
    graph_edges: list[dict[str, str]] = []

    for i, event in enumerate(events):
        event_node_id = f"m:{event['id']}"
        graph_nodes[event_node_id] = {
            "id": event_node_id,
            "kind": "microblog",
            "label": event["label"],
            "sourceType": event["sourceType"],
            "name": event["shortId"],
            "text": event["text"],
            "weight": max(1, event["commentCount"] + event["repostCount"] + event["attitudeCount"]),
            "botShare": event["botShare"],
            "x": 95 + (i % 8) * 95,
            "y": 80 + (i // 8) * 70,
        }
        private = event_private[event["id"]]
        top_users = [uid for uid, _ in private["participant_counter"].most_common(args.participants_per_event)]
        for uid in top_users:
            short_uid = sha_short(uid)
            node_id = f"u:{short_uid}"
            actor = actor_lookup.get(short_uid)
            label_info = user_labels.get(uid, UserLabel("unknown", 0.0, "unknown"))
            graph_nodes[node_id] = {
                "id": node_id,
                "kind": "actor",
                "name": short_uid,
                "weight": max(1, actor_stats[uid]["comments"] + actor_stats[uid]["reposts"] + actor_stats[uid]["attitudes"]),
                "botLabel": label_info.bot_label,
                "botScore": round(label_info.bot_score, 4),
                "labelSource": label_info.label_source,
            }
            if uid in private["repost_users"]:
                graph_edges.append({"source": node_id, "target": event_node_id, "type": "repost"})
            if uid in private["comment_users"]:
                graph_edges.append({"source": node_id, "target": event_node_id, "type": "comment"})
            if uid in private["attitude_users"]:
                graph_edges.append({"source": node_id, "target": event_node_id, "type": "attitude"})

    return {
        "source": {
            "name": "MisBot: Weibo Misinformation and Social Bot Participation Dataset",
            "repository": "https://github.com/whr000001/MisBot",
            "paper": "https://arxiv.org/abs/2408.09613",
            "note": "Only short hashed ids and truncated text are emitted. Weakly supervised bot labels are proxy signals, not accusations.",
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
        "graph": {
            "nodes": list(graph_nodes.values()),
            "edges": graph_edges,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build public/data/misbot_dashboard.json from local MisBot raw data.")
    parser.add_argument("--raw", default="data/raw/misbot", help="Path to the unpacked MisBot raw directory.")
    parser.add_argument("--out", default="public/data/misbot_dashboard.json", help="Output dashboard JSON path.")
    parser.add_argument("--sample-size", type=int, default=60, help="Number of information instances to expose to the frontend.")
    parser.add_argument("--per-label", type=int, default=30, help="Target number of fake and real instances in the sample.")
    parser.add_argument("--participants-per-event", type=int, default=8, help="Maximum participant nodes per sampled event.")
    parser.add_argument("--text-limit", type=int, default=280, help="Maximum evidence text length.")
    parser.add_argument("--max-actors", type=int, default=36, help="Maximum actors exposed to the actor chart.")
    parser.add_argument("--max-keywords", type=int, default=24, help="Maximum keyword rows.")
    parser.add_argument("--max-phrases", type=int, default=36, help="Maximum repeated phrase rows.")
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
        f"wrote {out} with {len(dashboard['events'])} events, "
        f"{len(dashboard['actors'])} actors, and {len(dashboard['graph']['edges'])} graph edges"
    )


if __name__ == "__main__":
    main()
