-- Додаємо поле для збереження URL відео
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS generated_video_url TEXT;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'image'; -- 'image' або 'video'

