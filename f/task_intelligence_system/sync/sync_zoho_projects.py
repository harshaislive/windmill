import hashlib
import json
from datetime import datetime, timezone
from typing import Any

import requests
from requests import HTTPError
import wmill


DEFAULT_OWNER_ALLOWLIST = [
    "Mudumba sesha sai",
    "Harsha Mudumba",
    "Soundharya Somaraju",
    "Shivathmika Racharla",
]


def _stable_id(*parts: str) -> str:
    return hashlib.sha256(":".join(parts).encode("utf-8")).hexdigest()[:32]


def _zoho_get(zoho: dict, path: str, params: dict | None = None) -> dict[str, Any]:
    response = requests.get(
        f"{zoho['base_url'].rstrip('/')}/{path.lstrip('/')}",
        headers={"Authorization": f"Zoho-oauthtoken {zoho['access_token']}"},
        params=params or {},
        timeout=60,
    )
    response.raise_for_status()
    if not response.text.strip():
        return {}
    try:
        return response.json()
    except ValueError:
        return {}


def _refresh_zoho_access_token(
    accounts_url: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> str:
    response = requests.post(
        f"{accounts_url.rstrip('/')}/oauth/v2/token",
        data={
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError(f"Zoho token refresh did not return access_token: {data}")
    return access_token


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


def _task_owners(task: dict) -> list[dict[str, Any]]:
    owners = (task.get("details") or {}).get("owners") or []
    normalized = []
    seen = set()
    for owner in owners:
        if isinstance(owner, dict):
            owner_name = _owner_display_name(owner)
            if not owner_name:
                continue
            owner_key = _owner_key(owner)
            if owner_key in seen:
                continue
            seen.add(owner_key)
            normalized.append(
                {
                    "owner_id": str(owner.get("id") or owner.get("zpuid") or owner.get("email") or ""),
                    "owner_name": owner_name,
                    "owner_key": owner_key,
                    "raw": owner,
                }
            )
    return normalized


def _task_owner_names(task: dict) -> list[str]:
    return [owner["owner_name"] for owner in _task_owners(task)]


def _is_allowed_owner(task: dict, owner_allowlist: list[str]) -> bool:
    allowed = {name.strip().casefold() for name in owner_allowlist if name.strip()}
    owner_names = {name.strip().casefold() for name in _task_owner_names(task)}
    return bool(allowed.intersection(owner_names))


def _parse_zoho_date(value):
    if not value:
        return None
    if isinstance(value, str):
        value = value.strip()
        for fmt in ("%m-%d-%Y", "%d-%m-%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value[:10], fmt).date().isoformat()
            except ValueError:
                continue
    return value


def _parse_numeric(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_zoho_timestamp(value):
    if not value:
        return None
    if isinstance(value, (int, float)):
        timestamp = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
    if isinstance(value, str):
        value = value.strip()
        if value.isdigit():
            return _parse_zoho_timestamp(int(value))
        for fmt in ("%m-%d-%Y %I:%M:%S %p", "%m-%d-%Y", "%d-%m-%Y %I:%M:%S %p", "%d-%m-%Y", "%Y-%m-%dT%H:%M:%S%z"):
            try:
                parsed = datetime.strptime(value, fmt)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.isoformat()
            except ValueError:
                continue
    return value


def _upsert_task(db, project_id: str, project_name: str, task: dict):
    zoho_task_id = str(task.get("id") or task.get("id_string"))
    task_id = _stable_id("task", project_id, zoho_task_id)
    owners = _task_owners(task)
    first_owner = owners[0] if owners else {}
    tags = [tag.get("name", str(tag)) if isinstance(tag, dict) else str(tag) for tag in task.get("tags", [])]
    status = (task.get("status") or {}).get("name") if isinstance(task.get("status"), dict) else task.get("status")

    db.query(
        """
        insert into task_intel_tasks (
            id, zoho_task_id, project_id, project_name, title, description, status,
            owner_id, owner_name, priority, start_date, due_date, percent_complete,
            tags, raw, updated_at, synced_at
        )
        values (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11::date, $12::date, $13::numeric,
            $14::jsonb, $15::jsonb, now(), now()
        )
        on conflict (zoho_task_id) do update set
            project_name = excluded.project_name,
            title = excluded.title,
            description = excluded.description,
            status = excluded.status,
            owner_id = excluded.owner_id,
            owner_name = excluded.owner_name,
            priority = excluded.priority,
            start_date = excluded.start_date,
            due_date = excluded.due_date,
            percent_complete = excluded.percent_complete,
            tags = excluded.tags,
            raw = excluded.raw,
            updated_at = now(),
            synced_at = now()
        """,
        task_id,
        zoho_task_id,
        project_id,
        project_name,
        task.get("name") or task.get("task_name") or "Untitled task",
        task.get("description") or "",
        status,
        first_owner.get("owner_id", ""),
        first_owner.get("owner_name"),
        task.get("priority"),
        _parse_zoho_date(task.get("start_date")),
        _parse_zoho_date(task.get("end_date") or task.get("due_date")),
        _parse_numeric(task.get("percent_complete")),
        json.dumps(tags),
        json.dumps(task),
    ).execute()
    return task_id, zoho_task_id


def _sync_task_owners(db, task_id: str, zoho_task_id: str, task: dict):
    owners = _task_owners(task)
    db.query("delete from task_intel_task_owners where task_id = $1", task_id).execute()
    for owner in owners:
        db.query(
            """
            insert into task_intel_task_owners (
                id, task_id, zoho_task_id, owner_id, owner_name, owner_key, raw, synced_at
            )
            values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
            on conflict (task_id, owner_key) do update set
                owner_id = excluded.owner_id,
                owner_name = excluded.owner_name,
                raw = excluded.raw,
                synced_at = now()
            """,
            _stable_id("task_owner", task_id, owner["owner_key"]),
            task_id,
            zoho_task_id,
            owner["owner_id"],
            owner["owner_name"],
            owner["owner_key"],
            json.dumps(owner["raw"]),
        ).execute()


def _sync_comments(db, zoho: dict, portal_id: str, project_id: str, task_id: str, zoho_task_id: str):
    data = _zoho_get(zoho, f"portal/{portal_id}/projects/{project_id}/tasks/{zoho_task_id}/comments/")
    for comment in data.get("comments", []):
        zoho_comment_id = str(comment.get("id") or comment.get("id_string"))
        db.query(
            """
            insert into task_intel_task_comments (
                id, task_id, zoho_comment_id, author_id, author_name, body, created_at, raw, synced_at
            )
            values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb, now())
            on conflict (zoho_comment_id) do update set
                body = excluded.body,
                raw = excluded.raw,
                synced_at = now()
            """,
            _stable_id("comment", task_id, zoho_comment_id),
            task_id,
            zoho_comment_id,
            str(comment.get("posted_person_id", "")),
            comment.get("posted_by") or comment.get("added_by"),
            comment.get("content") or comment.get("comment") or "",
            _parse_zoho_timestamp(
                comment.get("posted_time_long")
                or comment.get("created_time_long")
                or comment.get("posted_time")
                or comment.get("created_time")
            ),
            json.dumps(comment),
        ).execute()


def _sync_files(db, zoho: dict, portal_id: str, project_id: str, task_id: str, zoho_task_id: str):
    try:
        data = _zoho_get(zoho, f"portal/{portal_id}/projects/{project_id}/tasks/{zoho_task_id}/attachments/")
    except HTTPError:
        return
    for item in data.get("attachments", []):
        zoho_file_id = str(item.get("id") or item.get("id_string"))
        file_name = item.get("name") or item.get("file_name") or "unnamed"
        db.query(
            """
            insert into task_intel_task_files (
                id, task_id, zoho_file_id, file_name, file_type, uploaded_by, uploaded_at, raw, synced_at
            )
            values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb, now())
            on conflict (zoho_file_id) do update set
                file_name = excluded.file_name,
                file_type = excluded.file_type,
                raw = excluded.raw,
                synced_at = now()
            """,
            _stable_id("file", task_id, zoho_file_id),
            task_id,
            zoho_file_id,
            file_name,
            file_name.rsplit(".", 1)[-1].lower() if "." in file_name else None,
            item.get("uploaded_by") or item.get("author_name"),
            _parse_zoho_timestamp(
                item.get("UPLOADED_TIME")
                or item.get("uploaded_time")
                or item.get("created_time")
            ),
            json.dumps(item),
        ).execute()


def _read_json_variable(path: str, fallback):
    try:
        value = wmill.get_variable(path)
    except Exception:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _normalize_project_ids(project_ids) -> list[str]:
    if project_ids is None:
        return []
    if isinstance(project_ids, list):
        return [str(project_id) for project_id in project_ids if str(project_id).strip()]
    if isinstance(project_ids, (int, float)):
        return [str(int(project_ids))]
    if isinstance(project_ids, str):
        value = project_ids.strip()
        if not value:
            return []
        try:
            parsed = json.loads(value)
            return _normalize_project_ids(parsed)
        except json.JSONDecodeError:
            return [part.strip() for part in value.split(",") if part.strip()]
    return [str(project_ids)]


def _read_string_variable(path: str, fallback: str | None = None) -> str | None:
    try:
        value = wmill.get_variable(path)
    except Exception:
        return fallback
    if value is None:
        return fallback
    value = str(value).strip()
    return value or fallback


def _iter_project_tasks(zoho: dict, portal_id: str, project_id: str, page_size: int = 200):
    seen_task_ids = set()
    project_name = project_id
    pages_scanned = 0

    for index in range(0, 10000, page_size):
        task_data = _zoho_get(
            zoho,
            f"portal/{portal_id}/projects/{project_id}/tasks/",
            {"range": page_size, "index": index},
        )
        tasks = task_data.get("tasks", []) or []
        if task_data.get("project_name"):
            project_name = task_data["project_name"]
        if not tasks:
            break

        pages_scanned += 1
        yielded_on_page = 0
        for task in tasks:
            zoho_task_id = str(task.get("id") or task.get("id_string") or "")
            if not zoho_task_id or zoho_task_id in seen_task_ids:
                continue
            seen_task_ids.add(zoho_task_id)
            yielded_on_page += 1
            yield project_name, task, pages_scanned

        if yielded_on_page == 0 or len(tasks) < page_size:
            break


def main(
    portal_id: str | None = None,
    project_ids: list[str] | None = None,
    owner_allowlist: list[str] | None = None,
    datatable_name: str = "main",
    zoho_base_url_variable_path: str = "f/task_intelligence_system/zoho_base_url",
    zoho_accounts_url_variable_path: str = "f/task_intelligence_system/zoho_accounts_url",
    zoho_client_id_variable_path: str = "f/task_intelligence_system/zoho_client_id",
    zoho_client_secret_variable_path: str = "f/task_intelligence_system/zoho_client_secret",
    zoho_refresh_token_variable_path: str = "f/task_intelligence_system/zoho_refresh_token",
    portal_id_variable_path: str = "f/task_intelligence_system/zoho_portal_id",
    project_ids_variable_path: str = "f/task_intelligence_system/zoho_project_ids",
    owner_allowlist_variable_path: str = "f/task_intelligence_system/owner_allowlist",
    sync_comments: bool = False,
    sync_files: bool = False,
) -> dict:
    db = wmill.datatable(datatable_name)
    zoho_base_url = _read_string_variable(zoho_base_url_variable_path, "https://projectsapi.zoho.in/restapi")
    zoho_accounts_url = _read_string_variable(zoho_accounts_url_variable_path, "https://accounts.zoho.in")
    zoho_client_id = _read_string_variable(zoho_client_id_variable_path)
    zoho_client_secret = _read_string_variable(zoho_client_secret_variable_path)
    zoho_refresh_token = _read_string_variable(zoho_refresh_token_variable_path)
    if not zoho_client_id or not zoho_client_secret or not zoho_refresh_token:
        raise RuntimeError("Zoho client ID, client secret, and refresh token variables are required.")
    zoho = {
        "base_url": zoho_base_url,
        "access_token": _refresh_zoho_access_token(
            zoho_accounts_url,
            zoho_client_id,
            zoho_client_secret,
            zoho_refresh_token,
        ),
    }
    portal_id = portal_id or wmill.get_variable(portal_id_variable_path)
    project_ids = _normalize_project_ids(project_ids or _read_json_variable(project_ids_variable_path, []))
    owner_allowlist = owner_allowlist or _read_json_variable(owner_allowlist_variable_path, DEFAULT_OWNER_ALLOWLIST)

    synced_tasks = 0
    skipped_tasks = 0
    scanned_tasks = 0
    project_page_counts = {}

    for project_id in project_ids:
        project_page_counts[project_id] = 0
        for project_name, task, pages_scanned in _iter_project_tasks(zoho, portal_id, project_id):
            project_page_counts[project_id] = max(project_page_counts[project_id], pages_scanned)
            scanned_tasks += 1
            if owner_allowlist and not _is_allowed_owner(task, owner_allowlist):
                skipped_tasks += 1
                continue
            task_id, zoho_task_id = _upsert_task(db, project_id, project_name, task)
            _sync_task_owners(db, task_id, zoho_task_id, task)
            if sync_comments:
                _sync_comments(db, zoho, portal_id, project_id, task_id, zoho_task_id)
            if sync_files:
                _sync_files(db, zoho, portal_id, project_id, task_id, zoho_task_id)
            synced_tasks += 1

    return {
        "datatable_name": datatable_name,
        "synced_tasks": synced_tasks,
        "skipped_tasks": skipped_tasks,
        "scanned_tasks": scanned_tasks,
        "project_page_counts": project_page_counts,
        "owner_allowlist": owner_allowlist,
        "auth_mode": "refresh_token",
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }



