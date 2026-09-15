-- Asignación de proyectos a desarrolladores: mientras un usuario no sea
-- admin (role=4 o department=2, ver utils/permissions.js) y no tenga una fila
-- acá para un proyecto, ese proyecto no le aparece en absoluto (ni en los
-- listados ni puede pedir sus tareas). El filtrado de qué tareas ve dentro de
-- un proyecto ya asignado usa la columna existente tasks.assigned_to — no
-- hace falta otra tabla para eso.
CREATE TABLE project_developers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_developers_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_developers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_project_developers_project_user UNIQUE (project_id, user_id)
);
