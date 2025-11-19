-- Додаємо поле для відстеження доступних оплачених генерацій
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_generations_available INTEGER DEFAULT 0;

-- Ініціалізуємо значення для існуючих користувачів на основі їх платежів
-- Рахуємо кількість успішних платежів (1 генерація за платіж)
UPDATE users 
SET paid_generations_available = COALESCE((
  SELECT COUNT(*) 
  FROM payments 
  WHERE payments.user_id = users.id 
    AND payments.status = 'completed'
), 0) - COALESCE(paid_generations_used, 0);

-- Переконуємося, що значення не від'ємне
UPDATE users 
SET paid_generations_available = GREATEST(paid_generations_available, 0)
WHERE paid_generations_available < 0;

