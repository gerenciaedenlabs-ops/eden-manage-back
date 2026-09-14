-- Repositorios de GitHub vinculados a un proyecto (varios por proyecto, ej.
-- front + back del mismo proyecto). Solo guarda la asociación — el
-- create/list/link real contra GitHub lo hace el backend en caliente
-- (src/utils/github-app.js) usando una GitHub App instalada en la org.
CREATE TABLE project_repositories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'github',
  repo_full_name VARCHAR(255) NOT NULL,
  repo_url VARCHAR(500) NOT NULL,
  default_branch VARCHAR(100) NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_repositories_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT uq_project_repositories_project_repo UNIQUE (project_id, repo_full_name)
);
