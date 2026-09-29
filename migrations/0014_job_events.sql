-- A8: interaction journal (impressions and clicks) with show-time propensities.
--
-- Why this table exists: ranking quality cannot be measured or improved from
-- state tables alone (saved/hidden/applied). Impressions and clicks have no
-- other home, and propensity (how likely a posting was to be shown) is required
-- for any later off-policy evaluation — it cannot be reconstructed after the
-- fact, which is why the column is here from the start even though the product
-- does not rank yet (item A10 wires that; until then propensity stays NULL and
-- no probability is invented).
--
-- What this table is NOT: not a state store. Saved/hidden/apply-marked state
-- lives in its own tables (single source of truth per fact); the analysis layer
-- joins them instead of duplicating them here.
--
-- Privacy: events belong to one user, carry no free text and no personal data
-- beyond the ids, and are deleted together with the profile (see
-- deleteAllProfiles) so a profile deletion leaves no behavioural trace.
CREATE TABLE IF NOT EXISTS job_events (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click')),
  position integer CHECK (position IS NULL OR position >= 0),
  ranker_version text,
  propensity numeric(6, 5) CHECK (propensity IS NULL OR (propensity >= 0 AND propensity <= 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_user_time_idx ON job_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_events_snapshot_idx ON job_events (snapshot_id);
COMMENT ON TABLE job_events IS 'Owner-scoped impression/click journal for ranking quality and later off-policy evaluation; state (saved/hidden/applied) stays in its own tables.';
COMMENT ON COLUMN job_events.propensity IS 'Normalised show probability of the posting at impression time; NULL while no ranker is wired into the read path (A10) - never a guessed value.';
COMMENT ON COLUMN job_events.ranker_version IS 'Version string of the ranker that produced the shown order, for later attribution.';
