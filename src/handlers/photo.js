import { storageService } from '../services/storage.js';
import { setSession } from '../utils/sessions.js';
import { styleSelectionKeyboard } from '../utils/keyboards.js';
import { removeKeyboard } from '../utils/helpers.js';
import { isGenerating } from '../utils/generationGuard.js';
import { config } from '../config.js';

/**
 * Реєстрація обробників фото
 */
export const registerPhotoHandlers = (bot) => {
  bot.on('photo', async (ctx) => {
    // Перевіряємо, чи не триває генерація
    if (isGenerating(ctx.from.id)) {
      await ctx.reply('⏳ Зараз генерую твоє фото, зачекай трохи... Це займе до хвилини ⏳');
      return;
    }

    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Найбільше фото
      const file = await ctx.telegram.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;

      // Зберігаємо оригінальне фото
      const originalPhotoUrl = await storageService.uploadFromTelegram(
        fileUrl,
        `${ctx.from.id}_${Date.now()}.jpg`
      );

      // Зберігаємо фото в сесії користувача
      setSession(ctx.from.id, {
        originalPhotoUrl,
        photoUrl: originalPhotoUrl,
        style: null,
        customWishes: null,
      });

      await removeKeyboard(ctx);

      // Показуємо вибір стилю з inline кнопками
      await ctx.reply('Обери стиль для покращеного фото 👇', {
        reply_markup: styleSelectionKeyboard,
      });
    } catch (error) {
      console.error('Error processing photo:', error);
      await ctx.reply('❌ Виникла помилка при обробці фото. Спробуй ще раз або звернись до підтримки.');
    }
  });
};

