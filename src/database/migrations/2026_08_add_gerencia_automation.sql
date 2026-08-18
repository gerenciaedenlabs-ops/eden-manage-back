ALTER TABLE gerencia_budget_items
  ADD COLUMN due_day INT NOT NULL DEFAULT 1;

CREATE TABLE gerencia_budget_occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  budget_item_id INT NOT NULL,
  period VARCHAR(7) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('auto_applied', 'pending_confirmation', 'confirmed', 'dismissed') NOT NULL DEFAULT 'pending_confirmation',
  transaction_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_occurrence_item FOREIGN KEY (budget_item_id) REFERENCES gerencia_budget_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_occurrence_tx FOREIGN KEY (transaction_id) REFERENCES gerencia_transactions(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_item_period (budget_item_id, period)
);

CREATE TABLE gerencia_savings_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gerencia_savings_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goal_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  note VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_saving_goal FOREIGN KEY (goal_id) REFERENCES gerencia_savings_goals(id) ON DELETE CASCADE
);
