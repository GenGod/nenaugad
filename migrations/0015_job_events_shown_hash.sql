-- A6: what was shown, recorded as a fact in the journal.
--
-- The seen-set rule ("do not re-show a posting the candidate already saw and did
-- not act on, unless it changed") compares the content the candidate was shown
-- with the content of the posting today. The journal is the only place where
-- "shown at time T" exists, so the fingerprint of what was shown belongs here,
-- next to the impression.
--
-- The fingerprint is captured by the SERVER from job_snapshots at write time,
-- never sent by the client: a client-supplied hash would let a caller claim
-- "you have never seen this" and put a hidden posting back in the feed.
--
-- NULL means "we do not know what was shown" (a click, which is not an exposure,
-- or a caller that recorded an impression before this column existed). The rule
-- then does NOT suppress the posting: hiding a posting we cannot prove was seen
-- is worse than showing it twice.
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS shown_content_hash text;
COMMENT ON COLUMN job_events.shown_content_hash IS 'Semantic fingerprint of the posting as shown (job_snapshots.content_hash at impression time); NULL = unknown, and unknown never suppresses.';
