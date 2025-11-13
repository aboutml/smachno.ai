import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const supabase = createClient(config.supabase.url, config.supabase.key);

export class StorageService {
  /**
   * Завантажує файл з Telegram та зберігає його
   * @param {string} fileUrl - URL файлу з Telegram
   * @param {string} fileName - Ім'я файлу
   * @returns {Promise<string>} Public URL збереженого файлу
   */
  async uploadFromTelegram(fileUrl, fileName) {
    try {
      // Завантажуємо файл з Telegram
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
      });

      const fileBuffer = Buffer.from(response.data);
      const filePath = `creatives/${Date.now()}_${fileName}`;

      // Завантажуємо в Supabase Storage
      const { data, error } = await supabase.storage
        .from('creatives')
        .upload(filePath, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) {
        console.error('Error uploading to storage:', error);
        throw error;
      }

      // Отримуємо public URL
      const { data: urlData } = supabase.storage
        .from('creatives')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error in uploadFromTelegram:', error);
      // Fallback: повертаємо оригінальний URL
      return fileUrl;
    }
  }

  /**
   * Зберігає згенероване зображення
   * @param {string} imageUrl - URL згенерованого зображення
   * @param {string} fileName - Ім'я файлу
   * @returns {Promise<string>} Public URL збереженого файлу
   */
  async saveGeneratedImage(imageUrl, fileName) {
    try {
      // Завантажуємо згенероване зображення
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });

      const fileBuffer = Buffer.from(response.data);
      const filePath = `generated/${Date.now()}_${fileName}`;

      // Завантажуємо в Supabase Storage
      const { data, error } = await supabase.storage
        .from('creatives')
        .upload(filePath, fileBuffer, {
          contentType: 'image/png',
          upsert: false,
        });

      if (error) {
        console.error('Error saving generated image:', error);
        throw error;
      }

      // Отримуємо public URL
      const { data: urlData } = supabase.storage
        .from('creatives')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error in saveGeneratedImage:', error);
      // Fallback: повертаємо оригінальний URL
      return imageUrl;
    }
  }
}

export const storageService = new StorageService();

