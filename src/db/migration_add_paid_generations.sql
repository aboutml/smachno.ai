-- Міграція: Додавання поля paid_generations_used для відстеження оплачених генерацій
-- Виконайте цей SQL в Supabase SQL Editor

-- Додаємо поле paid_generations_used, якщо його ще немає
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'paid_generations_used'
    ) THEN
        ALTER TABLE users ADD COLUMN paid_generations_used INTEGER DEFAULT 0;
        RAISE NOTICE 'Column paid_generations_used added successfully';
    ELSE
        RAISE NOTICE 'Column paid_generations_used already exists';
    END IF;
END $$;

