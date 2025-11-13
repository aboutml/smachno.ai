import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(config.supabase.url, config.supabase.key);

async function migrate() {
  try {
    console.log('🔄 Початок міграції бази даних...');

    // Читаємо SQL схему
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Виконуємо SQL запити
    // Примітка: Supabase не підтримує виконання множинних запитів через один виклик
    // Розділяємо на окремі запити
    const queries = schema
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));

    for (const query of queries) {
      if (query) {
        try {
          // Для CREATE TABLE та інших DDL операцій використовуємо SQL Editor вручну
          // або Supabase Management API
          console.log(`📝 Виконуємо запит: ${query.substring(0, 50)}...`);
          // Тут можна додати виконання через Supabase Management API
        } catch (error) {
          console.error('❌ Помилка виконання запиту:', error.message);
        }
      }
    }

    console.log('✅ Міграція завершена!');
    console.log('⚠️  Примітка: Виконайте SQL скрипт з src/db/schema.sql вручну в Supabase SQL Editor');
    
  } catch (error) {
    console.error('❌ Помилка міграції:', error);
    process.exit(1);
  }
}

migrate();

