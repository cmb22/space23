CREATE TABLE IF NOT EXISTS teacher_availability (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  start_utc TIMESTAMPTZ NOT NULL,
  end_utc TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_availability_teacher_id_idx
  ON teacher_availability(teacher_id);

CREATE INDEX IF NOT EXISTS teacher_availability_teacher_id_time_idx
  ON teacher_availability(teacher_id, start_utc, end_utc);