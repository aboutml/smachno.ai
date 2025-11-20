import { getSession, setSession, deleteSession } from '../utils/sessions.js';
import { mainMenuKeyboard, settingsKeyboard } from '../utils/keyboards.js';
import { removeKeyboard } from '../utils/helpers.js';
import { processGeneration } from './generation.js';
import { db } from '../db/database.js';

/**
 * Реєстрація обробників тексту
 */
export const registerTextHandlers = (bot) => {
  bot.on('text', async (ctx) => {
    // Ігноруємо команди
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    const session = getSession(ctx.from.id);

    // Перевіряємо, чи це зворотний зв'язок
    if (session && session.waitingForFeedback) {
      const feedbackMessage = ctx.message.text;
      
      // Отримуємо або створюємо користувача
      const userData = await db.createOrUpdateUser(ctx.from.id, {
        username: ctx.from.username,
        first_name: ctx.from.first_name,
      });

      // Зберігаємо зворотний зв'язок
      const savedFeedback = await db.saveFeedback(userData.id, feedbackMessage, 'general');
      
      if (savedFeedback) {
        await ctx.reply('✅ Дякую за твій зворотний зв\'язок! Ми обов\'язково його розглянемо. 💙', {
          reply_markup: settingsKeyboard,
        });
      } else {
        await ctx.reply('❌ Виникла помилка при збереженні повідомлення. Спробуй ще раз.', {
          reply_markup: settingsKeyboard,
        });
      }

      // Видаляємо флаг очікування зворотного зв'язку
      delete session.waitingForFeedback;
      if (Object.keys(session).length === 0) {
        deleteSession(ctx.from.id);
      } else {
        setSession(ctx.from.id, session);
      }
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
          [{ text: '📸 Згенерувати креатив десерту', callback_data: 'generate_photo' }],
          [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
          [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }]
        ],
      },
    });
  });
};

