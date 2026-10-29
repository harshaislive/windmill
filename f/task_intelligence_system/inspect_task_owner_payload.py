import wmill


def main(datatable_name: str = "main") -> dict:
    db = wmill.datatable(datatable_name)
    rows = db.query("""
        select id, title, owner_name, raw->'details'->'owners' as detail_owners, raw->'owners' as root_owners, raw->'owner_name' as raw_owner_name, raw->'owner' as raw_owner
        from task_intel_tasks
        order by synced_at desc nulls last
        limit 10
    """).fetch()
    return {"sample": [dict(row) for row in rows]}
