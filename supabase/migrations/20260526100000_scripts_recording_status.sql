ALTER TABLE scripts
  ADD COLUMN recording_status text NOT NULL DEFAULT 'pending'
    CHECK (recording_status IN ('pending', 'recorded', 'discarded'));
