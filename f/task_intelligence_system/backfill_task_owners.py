import hashlib
import json
from typing import Any

import wmill


def _stable_id(*parts: str) -> str:
    return hashlib.sha256(":".join(parts).encode("utf-8")).hexdigest()[:32]


def _owner_display_name(owner: dict) -> str | None:
    for key in ("full_name", "name", "email", "zpuid", "id"):
        value = owner.get(key)
        if value:
            return str(value).strip()
    first = str(owner.get("first_name") or "").strip()
    last = str(owner.get("last_name") or "").strip()
    full_name = " ".join(part for part in (first, last) if part)
    return full_name or None


def _owner_key(owner: dict) -> str:
    for key in ("id", "zpuid", "email"):
        value = owner.get(key)
        if value:
            return str(value).strip().casefold()
    return (_owner_display_name(owner) or "unassigned").casefold()


def _task_owners(raw: dict) -> list[dict[str, Any]]:
    owners = (raw.get("details") or {}).get("owners") or raw.get("owners") or []
    normalized = []
    seen = set()
    for owner in owners:
        if not isinstance(owner, dict):
            continue
        owner_name = _owner_display_name(owner)
        if not owner_name:
            continue
        owner_key = _owner_key(owner)
        if owner_key in seen:
            continue
        seen.add(owner_key)
        normalized.append({
            "owner_id": str(owner.get("id") or owner.get("zpuid") or owner.get("email") or ""),
            "owner_name": owner_name,
            "owner_key": owner_key,
            "raw": owner,
        })
    return normalized


def main(datatable_name: str = "main") -> dict:
    db = wmill.datatable(datatable_name)
    tasks = db.query("select id, zoho_task_id, raw from task_intel_tasks").fetch()
    db.query("delete from task_intel_task_owners").execute()
    owner_rows = 0
    tasks_with_owners = 0
    multi_owner_tasks = 0
    for task in tasks:
        raw = task.get("raw") or {}
        if isinstance(raw, str):
            raw = json.loads(raw)
        owners = _task_owners(raw)
        if owners:
            tasks_with_owners += 1
        if len(owners) > 1:
            multi_owner_tasks += 1
        for owner in owners:
            db.query("""
                insert into task_intel_task_owners (
                    id, task_id, zoho_task_id, owner_id, owner_name, owner_key, raw, synced_at
                )
                values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
                on conflict (task_id, owner_key) do update set
                    owner_id = excluded.owner_id,
                    owner_name = excluded.owner_name,
                    raw = excluded.raw,
                    synced_at = now()
            """, _stable_id("task_owner", task["id"], owner["owner_key"]), task["id"], task["zoho_task_id"], owner["owner_id"], owner["owner_name"], owner["owner_key"], json.dumps(owner["raw"])).execute()
            owner_rows += 1
    return {
        "datatable_name": datatable_name,
        "tasks_seen": len(tasks),
        "tasks_with_owners": tasks_with_owners,
        "multi_owner_tasks": multi_owner_tasks,
        "owner_rows": owner_rows,
    }
