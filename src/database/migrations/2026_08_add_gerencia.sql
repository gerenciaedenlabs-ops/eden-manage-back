CREATE TABLE gerencia_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('ingreso', 'gasto') NOT NULL,
  category VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL,
  is_recurring TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gerencia_loans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaborator_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255),
  loan_date DATE NOT NULL,
  installments_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_loan_collaborator FOREIGN KEY (collaborator_id) REFERENCES users(id)
);

CREATE TABLE gerencia_loan_installments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loan_id INT NOT NULL,
  installment_number INT NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid TINYINT(1) NOT NULL DEFAULT 0,
  paid_at DATETIME NULL,
  CONSTRAINT fk_installment_loan FOREIGN KEY (loan_id) REFERENCES gerencia_loans(id) ON DELETE CASCADE
);
