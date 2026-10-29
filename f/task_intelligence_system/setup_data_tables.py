import wmill


SCHEMA_SQL = """
create table if not exists task_intel_tasks (
    id text primary key,
    zoho_task_id text unique not null,
    project_id text not null,
    project_name text,
    title text not null,
    description text,
    status text,
    owner_id text,
    owner_name text,
    priority text,
    start_date date,
    due_date date,
    percent_complete numeric(5,2),
    tags jsonb not null default '[]'::jsonb,
    raw jsonb not null default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    synced_at timestamptz default now()
);

create table if not exists task_intel_task_comments (
    id text primary key,
    task_id text not null references task_intel_tasks(id) on delete cascade,
    zoho_comment_id text unique not null,
    author_id text,
    author_name text,
    body text not null,
    created_at timestamptz,
    raw jsonb not null default '{}'::jsonb,
    synced_at timestamptz default now()
);

create table if not exists task_intel_task_owners (
    id text primary key,
    task_id text not null references task_intel_tasks(id) on delete cascade,
    zoho_task_id text not null,
    owner_id text,
    owner_name text not null,
    owner_key text not null,
    raw jsonb not null default '{}'::jsonb,
    synced_at timestamptz default now(),
    unique(task_id, owner_key)
);

create table if not exists task_intel_board_corrections (
    zoho_task_id text primary key,
    category text,
    complexity text,
    updated_at timestamptz not null default now(),
    check (category is null or category in ('Bewild','Sales Sprint','Finance','Liaisoning','CDS','Regolith','Collective Ops','Other')),
    check (complexity is null or complexity in ('Low','Medium','High'))
);

create table if not exists task_intel_task_files (
    id text primary key,
    task_id text not null references task_intel_tasks(id) on delete cascade,
    zoho_file_id text unique not null,
    file_name text not null,
    file_type text,
    uploaded_by text,
    uploaded_at timestamptz,
    raw jsonb not null default '{}'::jsonb,
    synced_at timestamptz default now()
);

create table if not exists task_intel_task_iterations (
    id bigserial primary key,
    task_id text not null references task_intel_tasks(id) on delete cascade,
    iteration_type text not null,
    severity text not null,
    reason text not null,
    evidence text,
    detected_at timestamptz default now()
);

create table if not exists task_intel_task_dependencies (
    id bigserial primary key,
    task_id text not null references task_intel_tasks(id) on delete cascade,
    dependency_type text not null,
    dependency_team text,
    dependency_status text not null default 'Open',
    evidence text,
    first_seen_at timestamptz default now(),
    resolved_at timestamptz
);

create table if not exists task_intel_ai_insights (
    id bigserial primary key,
    task_id text not null references task_intel_tasks(id) on delete cascade,
    progress_estimate numeric(5,2),
    delay_probability numeric(5,2),
    workload_risk text,
    scope_drift boolean default false,
    execution_confidence numeric(5,2),
    insight_summary text,
    raw_ai_output jsonb not null default '{}'::jsonb,
    generated_at timestamptz default now()
);

create table if not exists task_intel_employee_metrics (
    id bigserial primary key,
    employee_id text,
    employee_name text,
    active_tasks integer default 0,
    blocked_tasks integer default 0,
    review_tasks integer default 0,
    workload_risk text,
    measured_at timestamptz default now()
);

create index if not exists idx_tasks_project_status on task_intel_tasks(project_id, status);
create index if not exists idx_tasks_owner on task_intel_tasks(owner_id);
create index if not exists idx_task_owners_task on task_intel_task_owners(task_id);
create index if not exists idx_task_owners_name on task_intel_task_owners(owner_name);
create index if not exists idx_comments_task_created on task_intel_task_comments(task_id, created_at);
create index if not exists idx_files_task_uploaded on task_intel_task_files(task_id, uploaded_at);
create index if not exists idx_insights_task_generated on task_intel_ai_insights(task_id, generated_at desc);
create index if not exists idx_dependencies_task_status on task_intel_task_dependencies(task_id, dependency_status);
"""


def main(datatable_name: str = "main") -> dict:
    db = wmill.datatable(datatable_name)
    db.query(SCHEMA_SQL).fetch(result_collection="all_statements_all_rows")
    return {
        "datatable_name": datatable_name,
        "created_tables": [
            "task_intel_tasks",
            "task_intel_task_owners",
            "task_intel_task_comments",
            "task_intel_task_files",
            "task_intel_task_iterations",
            "task_intel_task_dependencies",
            "task_intel_ai_insights",
            "task_intel_employee_metrics",
            "task_intel_board_corrections",
        ],
    }



