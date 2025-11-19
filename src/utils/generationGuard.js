import { getSession } from './sessions.js';

/**
 * Перевіряє, чи триває генерація для користувача
 * @param {number} telegramId - Telegram ID користувача
 * @returns {boolean} - true, якщо генерація в процесі
 */
export const isGenerating = (telegramId) => {
  const session = getSession(telegramId);
  return session?.isGenerating === true;
};

/**
 * Middleware для перевірки стану генерації
 * Показує повідомлення, якщо користувач намагається щось зробити під час генерації
 */
export const checkGenerationInProgress = async (ctx, next) => {
  if (isGenerating(ctx.from.id)) {
    await ctx.answerCbQuery?.('⏳ Зачекай, генерація в процесі...', { show_alert: false });
    if (ctx.reply) {
      await ctx.reply('⏳ Зараз генерую твоє фото, зачекай трохи... Це займе до хвилини ⏳');
    }
    return;
  }
  return next();
};

