from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests
import wmill


ZOOM_USER_EMAIL = "connect@beforest.co"
MEETING_TOPIC_SUBSTRING = "collective introduction"
PIPEDRIVE_COMPANY_DOMAIN = "beforest"
PIPEDRIVE_OWNER_ID = 22251956
PIPEDRIVE_ACTIVITY_TYPE = "meeting"
PIPEDRIVE_LABEL_IDS = [111]
PIPEDRIVE_DEAL_EMAIL_FIELD_KEY = "2f592ab838e053d66de919b9b186e55e983747c9"
STATE_VERSION = 1

VAR_PATHS = {
    "zoom_account_id": "f/collectives/zoom_collective_to_pipedrive/zoom_account_id",
    "zoom_authorization_basic": "f/collectives/zoom_collective_to_pipedrive/zoom_authorization_basic",
    "pipedrive_api_key": "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key",
}

PIPELINE_RULES = [
    {"keyword": "hammiyala", "pipeline_id": 1, "stage_id": 10},
    {"keyword": "mumbai", "pipeline_id": 2, "stage_id": 13},
    {"keyword": "poomaale", "pipeline_id": 3, "stage_id": 20},
    {"keyword": "bhopal", "pipeline_id": 4, "stage_id": 37},
]


class SyncError(RuntimeError):
    pass


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def build_person_name(registrant: dict[str, Any]) -> str:
    first = (registrant.get("first_name") or "").strip()
    last = (registrant.get("last_name") or "").strip()
    full_name = " ".join(part for part in [first, last] if part).strip()
    if full_name:
        return full_name
    email = normalize_email(registrant.get("email"))
    if email:
        return email.split("@", 1)[0]
    return "Zoom Registrant"


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def format_due_fields(meeting_start_time: str | None) -> tuple[str | None, str | None]:
    dt = parse_iso_datetime(meeting_start_time)
    if not dt:
        return None, None
    return dt.date().isoformat(), dt.strftime("%H:%M:%S")


def get_required_variable(path: str) -> str:
    value = wmill.get_variable(path)
    if not value:
        raise SyncError(f"Missing required Windmill variable at {path}")
    return value


def get_zoom_access_token() -> str:
    account_id = get_required_variable(VAR_PATHS["zoom_account_id"])
    authorization_basic = get_required_variable(VAR_PATHS["zoom_authorization_basic"])
    response = requests.post(
        "https://zoom.us/oauth/token",
        params={"grant_type": "account_credentials", "account_id": account_id},
        headers={"Authorization": f"Basic {authorization_basic}"},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise SyncError("Zoom access token was not returned")
    return token


def zoom_get(endpoint: str, token: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    response = requests.get(
        f"https://api.zoom.us/v2/{endpoint}",
        params=params or {},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def get_all_collective_meetings(token: str) -> list[dict[str, Any]]:
    meetings: list[dict[str, Any]] = []
    next_page_token = ""
    now = datetime.now(timezone.utc)
    while True:
        payload = zoom_get(
            f"users/{ZOOM_USER_EMAIL}/meetings",
            token,
            {
                "type": "scheduled",
                "page_size": 300,
                "next_page_token": next_page_token,
            },
        )
        for meeting in payload.get("meetings", []):
            topic = (meeting.get("topic") or "").strip()
            if MEETING_TOPIC_SUBSTRING not in topic.lower():
                continue
            start_time = parse_iso_datetime(meeting.get("start_time"))
            if not start_time:
                continue
            if start_time < now:
                continue
            meetings.append(meeting)
        next_page_token = payload.get("next_page_token") or ""
        if not next_page_token:
            break
    return meetings


def get_meeting_registrants(meeting_id: int, token: str) -> list[dict[str, Any]]:
    registrants: list[dict[str, Any]] = []
    next_page_token = ""
    while True:
        payload = zoom_get(
            f"meetings/{meeting_id}/registrants",
            token,
            {"page_size": 300, "next_page_token": next_page_token},
        )
        registrants.extend(payload.get("registrants", []))
        next_page_token = payload.get("next_page_token") or ""
        if not next_page_token:
            break
    return registrants


def resolve_pipeline(topic: str) -> dict[str, int] | None:
    lower = topic.lower()
    for rule in PIPELINE_RULES:
        if rule["keyword"] in lower:
            return {
                "pipeline_id": rule["pipeline_id"],
                "stage_id": rule["stage_id"],
            }
    return None


def pipedrive_request(
    method: str,
    path: str,
    api_key: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    merged_params = {"api_token": api_key}
    if params:
        merged_params.update(params)
    response = requests.request(
        method,
        f"https://{PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v2/{path}",
        params=merged_params,
        json=json_body,
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success", False):
        raise SyncError(f"Pipedrive request failed for {path}: {payload}")
    return payload


def search_person_by_email(email: str, api_key: str) -> dict[str, Any] | None:
    payload = pipedrive_request(
        "GET",
        "persons/search",
        api_key,
        params={
            "term": email,
            "fields": "email",
            "exact_match": "true",
            "limit": 1,
        },
    )
    items = (payload.get("data") or {}).get("items") or []
    if not items:
        return None
    item = items[0].get("item") or items[0]
    return item


def create_person(registrant: dict[str, Any], api_key: str) -> dict[str, Any]:
    email = normalize_email(registrant.get("email"))
    if not email:
        raise SyncError("Cannot create a Pipedrive person without an email")
    phones = []
    phone = (registrant.get("phone") or "").strip()
    if phone:
        phones.append({"value": phone, "primary": True, "label": "work"})
    payload = pipedrive_request(
        "POST",
        "persons",
        api_key,
        json_body={
            "name": build_person_name(registrant),
            "owner_id": PIPEDRIVE_OWNER_ID,
            "emails": [{"value": email, "primary": True, "label": "work"}],
            "phones": phones,
        },
    )
    return payload["data"]


def create_deal(
    person_id: int,
    person_name: str,
    meeting: dict[str, Any],
    pipeline: dict[str, int],
    registrant: dict[str, Any],
    api_key: str,
) -> dict[str, Any]:
    payload = pipedrive_request(
        "POST",
        "deals",
        api_key,
        json_body={
            "title": f"{person_name} - {meeting['topic'].strip()}",
            "owner_id": PIPEDRIVE_OWNER_ID,
            "person_id": person_id,
            "pipeline_id": pipeline["pipeline_id"],
            "stage_id": pipeline["stage_id"],
            "label_ids": PIPEDRIVE_LABEL_IDS,
            PIPEDRIVE_DEAL_EMAIL_FIELD_KEY: normalize_email(registrant.get("email")),
        },
    )
    return payload["data"]


def create_activity(
    person_id: int,
    deal_id: int,
    meeting: dict[str, Any],
    registrant: dict[str, Any],
    api_key: str,
) -> dict[str, Any]:
    due_date, due_time = format_due_fields(meeting.get("start_time"))
    note_parts = [
        f"Zoom meeting: {meeting['topic'].strip()}",
        f"Registration email: {normalize_email(registrant.get('email'))}",
    ]
    created_at = registrant.get("create_time")
    if created_at:
        note_parts.append(f"Zoom registration time: {created_at}")
    join_url = registrant.get("join_url")
    if join_url:
        note_parts.append(f"Join URL: {join_url}")
    payload = pipedrive_request(
        "POST",
        "activities",
        api_key,
        json_body={
            "subject": meeting["topic"].strip(),
            "type": PIPEDRIVE_ACTIVITY_TYPE,
            "owner_id": PIPEDRIVE_OWNER_ID,
            "deal_id": deal_id,
            "person_id": person_id,
            "due_date": due_date,
            "due_time": due_time,
            "note": "\n".join(note_parts),
        },
    )
    return payload["data"]


def get_existing_deal_emails(api_key: str) -> set[str]:
    emails: set[str] = set()
    start = 0
    limit = 500
    while True:
        response = requests.get(
            f"https://{PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1/deals",
            params={
                "api_token": api_key,
                "status": "all_not_deleted",
                "start": start,
                "limit": limit,
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success", False):
            raise SyncError(f"Failed to load existing Pipedrive deals: {payload}")
        for deal in payload.get("data") or []:
            email = normalize_email(deal.get(PIPEDRIVE_DEAL_EMAIL_FIELD_KEY))
            if email:
                emails.add(email)
        pagination = (payload.get("additional_data") or {}).get("pagination") or {}
        if not pagination.get("more_items_in_collection"):
            break
        start = int(pagination.get("next_start") or 0)
    return emails


def load_state() -> dict[str, Any]:
    state = wmill.get_state() or {}
    if not state:
        return {"version": STATE_VERSION, "processed": {}, "runs": [], "email_cache": {}}
    state.setdefault("version", STATE_VERSION)
    state.setdefault("processed", {})
    state.setdefault("runs", [])
    state.setdefault("email_cache", {})
    return state


def build_processed_key(meeting_id: int, registrant: dict[str, Any]) -> str:
    registrant_id = (registrant.get("id") or "").strip()
    if registrant_id:
        return f"{meeting_id}:{registrant_id}"
    return f"{meeting_id}:{normalize_email(registrant.get('email'))}"


def trim_runs(runs: list[dict[str, Any]], keep: int = 25) -> list[dict[str, Any]]:
    return runs[-keep:]


def main(dry_run: bool = False, reset_state: bool = False) -> dict[str, Any]:
    state = load_state()
    if reset_state:
        state = {"version": STATE_VERSION, "processed": {}, "runs": [], "email_cache": {}}
    pipedrive_api_key = get_required_variable(VAR_PATHS["pipedrive_api_key"])
    zoom_token = get_zoom_access_token()
    original_processed = dict(state["processed"])
    original_email_cache = dict(state["email_cache"])
    email_cache: dict[str, dict[str, Any]] = state["email_cache"]
    existing_deal_emails = get_existing_deal_emails(pipedrive_api_key)

    meetings = get_all_collective_meetings(zoom_token)
    summary: dict[str, Any] = {
        "dry_run": dry_run,
        "meeting_count": len(meetings),
        "registrants_seen": 0,
        "processed_existing_state": 0,
        "created_people": 0,
        "created_deals": 0,
        "created_activities": 0,
        "skipped_missing_email": 0,
        "skipped_unmapped_meetings": 0,
        "skipped_non_approved": 0,
        "skipped_existing_deals": 0,
        "errors": [],
        "created": [],
        "skipped_meetings": [],
    }

    processed = state["processed"]
    run_started_at = datetime.now(timezone.utc).isoformat()

    for meeting in meetings:
        topic = (meeting.get("topic") or "").strip()
        meeting_id = meeting.get("id")
        if not meeting_id:
            continue

        pipeline = resolve_pipeline(topic)
        if not pipeline:
            summary["skipped_unmapped_meetings"] += 1
            summary["skipped_meetings"].append({"meeting_id": meeting_id, "topic": topic})
            continue

        registrants = get_meeting_registrants(meeting_id, zoom_token)
        for registrant in registrants:
            summary["registrants_seen"] += 1
            if registrant.get("status") not in (None, "approved"):
                summary["skipped_non_approved"] += 1
                continue

            email = normalize_email(registrant.get("email"))
            if not email:
                summary["skipped_missing_email"] += 1
                continue

            processed_key = build_processed_key(meeting_id, registrant)
            if processed_key in processed:
                summary["processed_existing_state"] += 1
                continue

            cached_email = email_cache.get(email) or {}
            if email in existing_deal_emails or cached_email.get("has_existing_deal"):
                summary["skipped_existing_deals"] += 1
                continue

            try:
                person = None
                person_id = cached_email.get("person_id")
                if person_id:
                    person = {"id": person_id, "name": cached_email.get("person_name") or build_person_name(registrant)}
                else:
                    person = search_person_by_email(email, pipedrive_api_key)

                if person:
                    resolved_person_id = int(person["id"])
                    email_cache[email] = {
                        "person_id": resolved_person_id,
                        "person_name": person.get("name") or build_person_name(registrant),
                        "has_existing_deal": False,
                    }

                created_person = False
                if not person:
                    if dry_run:
                        person = {
                            "id": -1,
                            "name": build_person_name(registrant),
                        }
                    else:
                        person = create_person(registrant, pipedrive_api_key)
                    created_person = True
                    summary["created_people"] += 1

                person_id = int(person["id"])
                person_name = person.get("name") or build_person_name(registrant)

                if dry_run:
                    deal = {"id": -1}
                    activity = {"id": -1}
                else:
                    deal = create_deal(person_id, person_name, meeting, pipeline, registrant, pipedrive_api_key)
                    activity = create_activity(person_id, int(deal["id"]), meeting, registrant, pipedrive_api_key)

                summary["created_deals"] += 1
                summary["created_activities"] += 1
                existing_deal_emails.add(email)
                email_cache[email] = {
                    "person_id": person_id,
                    "person_name": person_name,
                    "has_existing_deal": True,
                }

                processed_entry = {
                    "meeting_id": meeting_id,
                    "meeting_topic": topic,
                    "email": email,
                    "registrant_id": registrant.get("id"),
                    "person_id": person_id,
                    "deal_id": deal["id"],
                    "activity_id": activity["id"],
                    "created_person": created_person,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                }
                processed[processed_key] = processed_entry
                summary["created"].append(processed_entry)
            except Exception as exc:  # noqa: BLE001
                summary["errors"].append(
                    {
                        "meeting_id": meeting_id,
                        "meeting_topic": topic,
                        "email": email,
                        "error": str(exc),
                    }
                )

    if dry_run:
        state["processed"] = original_processed
        state["email_cache"] = original_email_cache
        summary["dry_run_note"] = "Dry run does not persist processed state."
        return summary

    state["processed"] = processed
    state["email_cache"] = email_cache
    state["last_run_started_at"] = run_started_at
    state["last_run_completed_at"] = datetime.now(timezone.utc).isoformat()
    state["runs"] = trim_runs(
        state["runs"]
        + [
            {
                "started_at": run_started_at,
                "completed_at": state["last_run_completed_at"],
                "summary": {
                    key: value
                    for key, value in summary.items()
                    if key not in {"created", "errors", "skipped_meetings"}
                },
                "errors": summary["errors"][:25],
            }
        ]
    )
    wmill.set_state(state)
    return summary
