import { config } from '../config.js';
import { db } from '../db/database.js';
import { getWelcomeMessage } from '../utils/messages.js';
import { mainMenuReplyKeyboardMarkup } from '../utils/keyboards.js';
import { isAdmin } from '../utils/helpers.js';

/**
 * Реєстрація обробників команд
 */
export const registerCommands = (bot) => {
  // Команда /start
  bot.command('start', async (ctx) => {
    const user = ctx.from;
    
    // Створюємо або оновлюємо користувача
    await db.createOrUpdateUser(user.id, {
      username: user.username,
      first_name: user.first_name || user.first_name,
    });

    await ctx.reply(getWelcomeMessage(user.first_name), {
      parse_mode: 'Markdown',
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  // Команда /stats - статистика (тільки для адмінів)
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id, config.admin.userIds)) {
      await ctx.reply('❌ У тебе немає доступу до цієї команди.');
      return;
    }

    const stats = await db.getStats();
    
    if (!stats) {
      await ctx.reply('❌ Помилка отримання статистики.');
      return;
    }

    const statsMessage = `📊 **Статистика бота:**

👥 Користувачів: ${stats.totalUsers}
🎨 Креативів створено: ${stats.totalCreatives}
💰 Загальний дохід: ${stats.totalRevenue} грн`;

    await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
  });

  // Команда /broadcast - розсилка (тільки для адмінів)
  bot.command('feedback_list', async (ctx) => {
    try {
      // Перевіряємо, чи користувач є адміном
      if (!config.admin.userIds.includes(ctx.from.id)) {
        await ctx.reply('❌ У тебе немає доступу до цієї команди.');
        return;
      }

      const feedbackList = await db.getAllFeedback(20);

      if (feedbackList.length === 0) {
        await ctx.reply('📭 Поки що немає зворотних зв\'язків.');
        return;
      }

      let message = `📝 Останні зворотні зв'язки (${feedbackList.length}):\n\n`;

      for (const feedback of feedbackList) {
        const user = feedback.users || {};
        const username = user.username ? `@${user.username}` : (user.first_name || `ID: ${user.telegram_id}`);
        const date = new Date(feedback.created_at).toLocaleString('uk-UA');
        const type = feedback.type === 'bug' ? '🐛' : feedback.type === 'suggestion' ? '💡' : '📝';
        
        message += `${type} <b>${username}</b> (${date}):\n`;
        message += `${feedback.message.substring(0, 200)}${feedback.message.length > 200 ? '...' : ''}\n\n`;
      }

      await ctx.reply(message, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error('[feedback_list] Error:', error);
      await ctx.reply('❌ Помилка при отриманні списку зворотних зв\'язків.');
    }
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id, config.admin.userIds)) {
      await ctx.reply('❌ У тебе немає доступу до цієї команди.');
      return;
    }

    const message = ctx.message.text.replace('/broadcast', '').trim();
    
    if (!message) {
      await ctx.reply('📢 Використання: /broadcast <повідомлення>\n\nНадішли повідомлення для розсилки всім користувачам.');
      return;
    }

    // В реальному проєкті тут буде отримання всіх користувачів з БД
    await ctx.reply('📢 Розсилка розпочата. (Для MVP - функція в розробці)');
  });
};

