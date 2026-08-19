CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'task_assigned',
  message VARCHAR(500) NOT NULL,
  related_task_id INT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_task FOREIGN KEY (related_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_unread (user_id, is_read)
);
