ALTER TABLE tasks
  ADD COLUMN created_by INT NULL AFTER assigned_to,
  ADD CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id);
