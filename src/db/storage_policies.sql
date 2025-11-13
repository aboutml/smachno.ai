-- Політики безпеки для Supabase Storage bucket 'creatives'
-- Виконайте ці запити в SQL Editor в панелі Supabase

-- Дозволити публічне читання файлів
CREATE POLICY "Public Read Access" ON storage.objects
FOR SELECT 
USING (bucket_id = 'creatives');

-- Дозволити завантаження файлів (INSERT)
CREATE POLICY "Public Upload Access" ON storage.objects
FOR INSERT 
WITH CHECK (bucket_id = 'creatives');

-- Дозволити оновлення файлів (опціонально)
CREATE POLICY "Public Update Access" ON storage.objects
FOR UPDATE 
USING (bucket_id = 'creatives')
WITH CHECK (bucket_id = 'creatives');

-- Дозволити видалення файлів (опціонально, якщо потрібно)
-- CREATE POLICY "Public Delete Access" ON storage.objects
-- FOR DELETE 
-- USING (bucket_id = 'creatives');

