CREATE TABLE gerencia_budget_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('ingreso', 'gasto') NOT NULL,
  category VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE gerencia_transactions
  DROP COLUMN is_recurring;
