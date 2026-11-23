# Encrypted backups of the self-hosted Supabase (Coolify service dafy2psupot5n1tdbuqzkpov) to Dropbox.
#
# mode="db"    (nightly): pg_dump -Fc of the whole `postgres` DB (all schemas: auth, storage, app schemas, archives)
#                         + pg_dumpall --globals-only (roles) + row counts, each age-encrypted, to
#                         /Backups/supabase/db/<YYYY-MM-DD>/. Keeps the last `keep_days` days.
# mode="media" (hourly):  incremental mirror of every storage object to /Backups/supabase/media/<xx>/<random id>.age
#                         (names scrambled; encrypted map in media/_index.json.age). New or changed objects only
#                         (eTag tracked in this script's Windmill state). Never deletes.
#                         Stops after `budget_seconds`; the next run continues.
#
# How it reaches Supabase: Windmill workers have the host Docker socket, so the DB is dumped with `docker exec`
# (no DB password stored anywhere) and the storage service key is read from the container at run time.
# Encryption: age, public key in f/supabase/backup_age_public_key. The PRIVATE key is offline with Harsha:
# without it nothing here can be restored. Dropbox: the vectorsearch Dropbox app (f/supabase/backup_dropbox_*).
# Throughput is capped (rate_mb_s) because /root/monitor_killswitch.sh stops any container sending >500 MB/min.
# On failure: one email to harsha@beforest.co (at most every 6 h), then the job fails.
#
# Restore: see Obsidian "Projects/Supabase Audit/7-selfhost-migration.md" -> Backups.

import datetime
import json
import os
import smtplib
import subprocess
import tempfile
import time
import uuid
from email.message import EmailMessage
from urllib.parse import quote

import pyrage
import requests
import wmill

DB_CT = "supabase-db-dafy2psupot5n1tdbuqzkpov"
STORAGE_CT = "supabase-storage-dafy2psupot5n1tdbuqzkpov"
SELF = "https://supabase.ops.beforest.co"
ROOT = "/Backups/supabase"
ALERT_TO = "harsha@beforest.co"
CHUNK = 32 * 1024 * 1024


class Dropbox:
    def __init__(self, rate_mb_s: float):
        r = requests.post("https://api.dropboxapi.com/oauth2/token", timeout=30,
                          data={"grant_type": "refresh_token",
                                "refresh_token": wmill.get_variable("f/supabase/backup_dropbox_refresh_token")},
                          auth=(wmill.get_variable("f/supabase/backup_dropbox_app_key"),
                                wmill.get_variable("f/supabase/backup_dropbox_app_secret")))
        r.raise_for_status()
        self.h = {"Authorization": "Bearer " + r.json()["access_token"]}
        self.rate = rate_mb_s * 1e6
        self.window = []  # (timestamp, bytes) in the last 60 s

    def _throttle(self, n: int):
        # Hard rolling 60-second cap (the server killswitch measures MB sent per minute; an average-since-start cap
        # allowed catch-up bursts). Objects are processed one at a time, so Kong's download rate follows this too.
        while True:
            now = time.time()
            self.window = [(t, b) for t, b in self.window if now - t <= 60]
            if not self.window or sum(b for _, b in self.window) + n <= self.rate * 60:
                self.window.append((now, n))
                return
            time.sleep(60 - (now - self.window[0][0]) + 0.05)

    def rpc(self, endpoint: str, body: dict) -> dict:
        r = requests.post(f"https://api.dropboxapi.com/2/{endpoint}", headers=self.h, json=body, timeout=60)
        if r.status_code == 409:
            return {"error": r.json()}
        r.raise_for_status()
        return r.json()

    def upload(self, local: str, path: str) -> int:
        size = os.path.getsize(local)
        commit = {"path": path, "mode": "overwrite", "mute": True}
        with open(local, "rb") as f:
            if size <= CHUNK:
                data = f.read()
                r = requests.post("https://content.dropboxapi.com/2/files/upload", data=data, timeout=600,
                                  headers=dict(self.h, **{"Content-Type": "application/octet-stream",
                                                          "Dropbox-API-Arg": json.dumps(commit)}))
                r.raise_for_status()
                self._throttle(len(data))
                return size
            data = f.read(CHUNK)
            r = requests.post("https://content.dropboxapi.com/2/files/upload_session/start", data=data, timeout=600,
                              headers=dict(self.h, **{"Content-Type": "application/octet-stream",
                                                      "Dropbox-API-Arg": json.dumps({"close": False})}))
            r.raise_for_status()
            self._throttle(len(data))
            sid, off = r.json()["session_id"], len(data)
            while True:
                data = f.read(CHUNK)
                last = off + len(data) >= size
                arg = {"cursor": {"session_id": sid, "offset": off}}
                ep = "finish" if last else "append_v2"
                if last:
                    arg["commit"] = commit
                else:
                    arg["close"] = False
                r = requests.post(f"https://content.dropboxapi.com/2/files/upload_session/{ep}", data=data,
                                  timeout=600, headers=dict(self.h, **{"Content-Type": "application/octet-stream",
                                                                       "Dropbox-API-Arg": json.dumps(arg)}))
                r.raise_for_status()
                self._throttle(len(data))
                off += len(data)
                if last:
                    return size


def recipient():
    return pyrage.x25519.Recipient.from_str(wmill.get_variable("f/supabase/backup_age_public_key").strip())


def encrypt(src: str, dst: str, rcpt) -> None:
    with open(src, "rb") as f:
        data = f.read()
    with open(dst, "wb") as f:
        f.write(pyrage.encrypt(data, [rcpt]))


def sh(args: list, out_path: str | None = None) -> str:
    if out_path:
        with open(out_path, "wb") as f:
            p = subprocess.run(args, stdout=f, stderr=subprocess.PIPE)
        out = ""
    else:
        p = subprocess.run(args, capture_output=True)
        out = p.stdout.decode()
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(args[:4])}… exit {p.returncode}: {p.stderr.decode()[-500:]}")
    return out


def psql_json(sql: str):
    out = sh(["docker", "exec", DB_CT, "psql", "-U", "supabase_admin", "-d", "postgres", "-At", "-c", sql])
    return json.loads(out or "null")


COUNT_SQL = """select coalesce(json_object_agg(s||'.'||t, n), '{}') from (
  select table_schema s, table_name t,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                                              false, true, '')))[1]::text::bigint n
  from information_schema.tables where table_type='BASE TABLE'
   and table_schema not in ('pg_catalog','information_schema')) x"""


def backup_db(dbx: Dropbox, keep_days: int) -> dict:
    rcpt = recipient()
    day = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    res = {"folder": f"{ROOT}/db/{day}", "files": {}}
    with tempfile.TemporaryDirectory() as tmp:
        dump, glob_, counts = f"{tmp}/postgres.dump", f"{tmp}/globals.sql", f"{tmp}/rowcounts.json"
        sh(["docker", "exec", DB_CT, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc"], dump)
        sh(["docker", "exec", DB_CT, "pg_dumpall", "-U", "supabase_admin", "--globals-only"], glob_)
        rc = psql_json(COUNT_SQL)
        with open(counts, "w") as f:
            json.dump({"taken_utc": datetime.datetime.utcnow().isoformat(), "tables": rc}, f, indent=1, sort_keys=True)
        if os.path.getsize(dump) < 100_000:
            raise RuntimeError(f"dump suspiciously small: {os.path.getsize(dump)} bytes")
        for name, src in [("postgres.dump", dump), ("globals.sql", glob_), ("rowcounts.json", counts)]:
            enc = src + ".age"
            encrypt(src, enc, rcpt)
            res["files"][name + ".age"] = dbx.upload(enc, f"{res['folder']}/{name}.age")
        res["tables"], res["rows"] = len(rc), sum(rc.values())
    # retention
    lst = dbx.rpc("files/list_folder", {"path": f"{ROOT}/db"})
    cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days=keep_days)).strftime("%Y-%m-%d")
    old = sorted(e["name"] for e in lst.get("entries", []) if e[".tag"] == "folder" and e["name"] < cutoff)
    for name in old:
        dbx.rpc("files/delete_v2", {"path": f"{ROOT}/db/{name}"})
    res["deleted_old"] = old
    return res


def backup_media(dbx: Dropbox, budget_seconds: int) -> dict:
    t0 = time.time()
    rcpt = recipient()
    key = sh(["docker", "exec", STORAGE_CT, "printenv", "SERVICE_SUPABASESERVICE_KEY"]).strip()
    h = {"Authorization": f"Bearer {key}", "apikey": key}
    objs = psql_json("select coalesce(json_agg(json_build_array(bucket_id, name, "
                     "coalesce(metadata->>'eTag', updated_at::text), metadata->>'mimetype', metadata->>'size')), '[]') "
                     "from storage.objects where name not like '%.emptyFolderPlaceholder'")
    # Names are scrambled: each object is stored as media/<id[:2]>/<id>.age with a random id. The mapping
    # (id -> bucket, path, eTag, content type, size) lives in this script's state AND, encrypted, in
    # media/_index.json.age (re-uploaded after every run that copied something), so a restore never depends on Windmill.
    state = wmill.get_state() or {}
    index = state.get("media_index", {})                      # id -> {b, n, e, ct, size}
    by_key = {f"{v['b']}/{v['n']}": k for k, v in index.items()}
    todo = [o for o in objs if index.get(by_key.get(f"{o[0]}/{o[1]}"), {}).get("e") != o[2]]
    done = failed = 0
    errors = []

    def save(upload_index: bool):
        state["media_index"] = index
        wmill.set_state(state)
        if upload_index:
            with tempfile.TemporaryDirectory() as tmp:
                p = f"{tmp}/_index.json"
                with open(p, "w") as f:
                    json.dump({"updated_utc": datetime.datetime.utcnow().isoformat(), "objects": index}, f)
                encrypt(p, p + ".age", rcpt)
                dbx.upload(p + ".age", f"{ROOT}/media/_index.json.age")

    for i, (b, n, e, ct, size) in enumerate(todo):
        if time.time() - t0 > budget_seconds:
            break
        oid = by_key.get(f"{b}/{n}") or uuid.uuid4().hex   # changed object keeps its id (overwritten in place)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                src = f"{tmp}/obj"
                with requests.get(f"{SELF}/storage/v1/object/authenticated/{quote(b)}/{quote(n, safe='/')}",
                                  headers=h, stream=True, timeout=300) as r:
                    r.raise_for_status()
                    with open(src, "wb") as f:
                        for c in r.iter_content(1 << 20):
                            f.write(c)
                encrypt(src, src + ".age", rcpt)
                dbx.upload(src + ".age", f"{ROOT}/media/{oid[:2]}/{oid}.age")
            index[oid] = {"b": b, "n": n, "e": e, "ct": ct, "size": size}
            by_key[f"{b}/{n}"] = oid
            done += 1
        except Exception as ex:  # noqa: BLE001 - keep going; retried next run
            failed += 1
            errors.append(f"{b}/{n}: {' '.join(str(ex).split())[:150]}")
        if (i + 1) % 25 == 0:
            save(False)
    save(done > 0)
    remaining = len(todo) - done - failed
    if failed and failed == len(todo) and failed >= 5:
        raise RuntimeError(f"all {failed} media uploads failed, e.g. {errors[:3]}")
    return {"objects": len(objs), "copied": done, "failed": failed, "remaining": remaining,
            "seconds": round(time.time() - t0), "errors": errors[:10]}


def alert(subject: str, body: str) -> None:
    state = wmill.get_state() or {}
    last = state.get("last_alert", 0)
    if time.time() - last < 6 * 3600:
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = "Beforest Backups <beforestai@gmail.com>", ALERT_TO, subject
    msg.set_content(body)
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:
        s.starttls()
        s.login("beforestai@gmail.com", wmill.get_variable("f/kms/SMTP_PASSWORD"))
        s.send_message(msg)
    state["last_alert"] = time.time()
    wmill.set_state(state)


def main(mode: str = "db", keep_days: int = 30, budget_seconds: int = 2400, rate_mb_s: float = 3.0):
    """mode: "db" (nightly full DB dump) or "media" (incremental storage mirror)."""
    try:
        dbx = Dropbox(rate_mb_s)
        if mode == "db":
            return backup_db(dbx, keep_days)
        if mode == "media":
            return backup_media(dbx, budget_seconds)
        raise ValueError(f"unknown mode {mode}")
    except Exception as ex:
        try:
            alert(f"[Backup FAILED] Supabase {mode} backup",
                  f"The self-hosted Supabase {mode} backup failed at {datetime.datetime.utcnow():%Y-%m-%d %H:%M} UTC.\n\n"
                  f"{type(ex).__name__}: {ex}\n\nWindmill: f/supabase/backup_selfhosted (check the job log).\n"
                  "If it says invalid_grant / 401 from Dropbox, the vectorsearch Dropbox token was reset: "
                  "copy the new DROPBOX_* values into f/supabase/backup_dropbox_*.")
        except Exception:  # noqa: BLE001 - never mask the real error
            pass
        raise
