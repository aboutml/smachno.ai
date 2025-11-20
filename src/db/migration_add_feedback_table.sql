-- Міграція для додавання таблиці feedback
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'general', -- 'bug', 'suggestion', 'general'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Індекс для швидкого пошуку за user_id
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

-- Індекс для швидкого пошуку за датою
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

