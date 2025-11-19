import { getSession, setSession } from '../utils/sessions.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { removeKeyboard } from '../utils/helpers.js';
import { processGeneration } from './generation.js';

/**
 * Реєстрація обробників тексту
 */
export const registerTextHandlers = (bot) => {
  bot.on('text', async (ctx) => {
    // Ігноруємо команди
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    // Перевіряємо, чи це побажання для кастомного стилю
    if (session && session.style === 'custom' && !session.customWishes) {
      // Зберігаємо побажання та запускаємо генерацію
      session.customWishes = ctx.message.text;
      setSession(ctx.from.id, session);
      
      await ctx.reply('Чудово! Починаю генерувати 😋\n\nЦе займе близько 1 хвилини.');
      await processGeneration(ctx, session);
      return;
    }

    await removeKeyboard(ctx);

    // Якщо це не побажання для стилю, просимо надіслати фото
    await ctx.reply('📸 Для генерації потрібно надіслати фото десерту.\n\nНатисни кнопку нижче або надішли фото напряму.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Згенерувати фото десерту', callback_data: 'generate_photo' }],
          [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
          [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }]
        ],
      },
    });
  });
};

