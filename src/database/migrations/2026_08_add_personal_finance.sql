CREATE TABLE personal_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('ingreso', 'gasto') NOT NULL,
  category VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE personal_budget_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('ingreso', 'gasto') NOT NULL,
  category VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_day INT NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_budget_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE personal_budget_occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  budget_item_id INT NOT NULL,
  period VARCHAR(7) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('auto_applied', 'pending_confirmation', 'confirmed', 'dismissed') NOT NULL DEFAULT 'pending_confirmation',
  transaction_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_occ_item FOREIGN KEY (budget_item_id) REFERENCES personal_budget_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_personal_occ_tx FOREIGN KEY (transaction_id) REFERENCES personal_transactions(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_personal_item_period (budget_item_id, period)
);

CREATE TABLE personal_debts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255),
  start_date DATE NOT NULL,
  installments_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_debt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE personal_debt_installments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  debt_id INT NOT NULL,
  installment_number INT NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid TINYINT(1) NOT NULL DEFAULT 0,
  paid_at DATETIME NULL,
  CONSTRAINT fk_personal_installment_debt FOREIGN KEY (debt_id) REFERENCES personal_debts(id) ON DELETE CASCADE
);

CREATE TABLE personal_savings_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_goal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE personal_savings_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goal_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  note VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_personal_entry_goal FOREIGN KEY (goal_id) REFERENCES personal_savings_goals(id) ON DELETE CASCADE
);
