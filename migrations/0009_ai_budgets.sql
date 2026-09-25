-- AI-001: persistent spending-control primitives (spec SP 9). Money is
-- stored as integer minor units (e.g. micro-cents) — never float. All
-- limits/checks happen in SQL with row locks; an unavailable database
-- means NO new paid operations, not "try without a reservation".
CREATE TABLE IF NOT EXISTS ai_budgets (
  id text PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('global', 'owner')),
  owner_id text, -- NULL for global; must be set for owner scope
  period text NOT NULL CHECK (period IN ('total', 'monthly', 'daily')),
  approved_limit_minor bigint NOT NULL CHECK (approved_limit_minor >= 0),
  settled_minor bigint NOT NULL DEFAULT 0 CHECK (settled_minor >= 0),
  held_minor bigint NOT NULL DEFAULT 0 CHECK (held_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, owner_id, period)
);
CREATE TABLE IF NOT EXISTS ai_operations (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  task_type text NOT NULL CHECK (task_type IN ('job_extraction', 'cv_extraction', 'cover_letter')),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'reserved', 'in_flight', 'uncertain', 'settled', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  input_hash text NOT NULL,
  deadline_at timestamptz NOT NULL,
  reserved_minor bigint NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  settled_minor bigint NOT NULL DEFAULT 0 CHECK (settled_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, task_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ai_operations_owner_idx ON ai_operations (owner_id);
CREATE INDEX IF NOT EXISTS ai_operations_status_idx ON ai_operations (status);
COMMENT ON TABLE ai_budgets IS 'Spending guard: atomic worst-case reservation enforces settled+held+new <= approved_limit. Zero limit = kill switch.';
COMMENT ON TABLE ai_operations IS 'One root AI operation: persistent attempt counters (never reset by retries or new idempotency keys), deadline, uncertain-billing state.';
