-- Catálogo relacional para el importador de backlogs tipo "ERP EDEN"
-- (Módulos, Roles, Casos de Uso, Épicas y Criterios de aceptación
-- estructurados), enlazado a `tasks` para que una Historia de Usuario
-- importada quede como una tarea normal del tablero pero con toda su
-- metadata navegable. Todo el catálogo es por proyecto (project_id):
-- cada proyecto trae sus propios módulos/roles/casos de uso, no es un
-- catálogo global compartido entre proyectos.

CREATE TABLE task_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  grupo VARCHAR(100) NULL,
  descripcion TEXT NULL,
  objetivo TEXT NULL,
  release_base VARCHAR(20) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_modules_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT uq_task_modules_project_code UNIQUE (project_id, code)
);

CREATE TABLE task_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  tipo VARCHAR(100) NULL,
  descripcion TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_roles_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT uq_task_roles_project_name UNIQUE (project_id, name)
);

CREATE TABLE task_epics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  module_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_epics_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_epics_module FOREIGN KEY (module_id) REFERENCES task_modules(id) ON DELETE CASCADE,
  CONSTRAINT uq_task_epics_module_name UNIQUE (module_id, name)
);

CREATE TABLE task_use_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  module_id INT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(500) NOT NULL,
  actor_principal VARCHAR(255) NULL,
  actores_secundarios VARCHAR(500) NULL,
  objetivo TEXT NULL,
  release_minimo VARCHAR(20) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_use_cases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_use_cases_module FOREIGN KEY (module_id) REFERENCES task_modules(id) ON DELETE SET NULL,
  CONSTRAINT uq_task_use_cases_project_code UNIQUE (project_id, code)
);

-- `release` es palabra reservada en MySQL (RELEASE SAVEPOINT), de ahí `release_tag`.
ALTER TABLE tasks
  ADD COLUMN module_id INT NULL AFTER tags,
  ADD COLUMN epic_id INT NULL AFTER module_id,
  ADD COLUMN role_id INT NULL AFTER epic_id,
  ADD COLUMN use_case_id INT NULL AFTER role_id,
  ADD COLUMN priority ENUM('Must','Should','Could') NULL AFTER use_case_id,
  ADD COLUMN release_tag VARCHAR(20) NULL AFTER priority,
  ADD COLUMN story_points INT NULL AFTER release_tag,
  ADD COLUMN external_code VARCHAR(30) NULL AFTER story_points,
  ADD COLUMN business_rules TEXT NULL AFTER external_code,
  ADD COLUMN ux_notes TEXT NULL AFTER business_rules,
  ADD COLUMN dependencies_raw VARCHAR(500) NULL AFTER ux_notes,
  ADD CONSTRAINT fk_tasks_module FOREIGN KEY (module_id) REFERENCES task_modules(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tasks_epic FOREIGN KEY (epic_id) REFERENCES task_epics(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tasks_role FOREIGN KEY (role_id) REFERENCES task_roles(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tasks_use_case FOREIGN KEY (use_case_id) REFERENCES task_use_cases(id) ON DELETE SET NULL,
  ADD CONSTRAINT uq_tasks_project_external_code UNIQUE (project_id, external_code);

CREATE TABLE task_acceptance_criteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  code VARCHAR(10) NULL,
  dado TEXT NULL,
  cuando TEXT NULL,
  entonces TEXT NULL,
  texto_completo TEXT NULL,
  resultado_prueba VARCHAR(100) NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_ac_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
