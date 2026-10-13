-- B54-001: login counter keys are now an HMAC of the email under a key derived from the
-- server secret. Every `login:` row so far holds the plain SHA-256 of an email, which a
-- database reader can test a guessed email against: delete them. At most one 15-minute
-- window of login counts starts over, once. Deletion counters (`delete:`) are unchanged.
DELETE FROM auth_attempts WHERE key LIKE 'login:%';
