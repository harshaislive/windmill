import wmill


def main(datatable_name: str = "main") -> dict:
    db = wmill.datatable(datatable_name)
    row = db.query("""
        select
            count(*)::int as owner_rows,
            count(distinct task_id)::int as tasks_with_owners,
            count(*) filter (where owner_name = 'Soundharya Somaraju')::int as soundharya_rows
        from task_intel_task_owners
    """).fetch_one()
    return dict(row)
