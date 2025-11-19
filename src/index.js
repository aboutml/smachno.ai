import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { registerCommands } from './handlers/commands.js';
import { registerPhotoHandlers } from './handlers/photo.js';
import { registerCallbacks } from './handlers/callbacks.js';
import { registerTextHandlers } from './handlers/text.js';
import { createWebhookServer, startWebhookServer } from './webhook/server.js';
import { isGenerating } from './utils/generationGuard.js';
import { getSession } from './utils/sessions.js';

if (!config.telegram.token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required!');
  process.exit(1);
}

const bot = new Telegraf(config.telegram.token);

// Middleware для логування
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} - ${ms}ms`);
});

// Глобальний middleware для блокування команд під час генерації
bot.use(async (ctx, next) => {
  // Перевіряємо, чи триває генерація
  if (isGenerating(ctx.from.id)) {
    // Для callback queries - показуємо toast
    if (ctx.updateType === 'callback_query') {
      await ctx.answerCbQuery('⏳ Зачекай, генерація в процесі...', { show_alert: false });
      return; // Блокуємо подальшу обробку
    }
    
    // Для команд - показуємо повідомлення
    if (ctx.updateType === 'message' && ctx.message?.text?.startsWith('/')) {
      await ctx.reply('⏳ Зараз генерую твоє фото, зачекай трохи... Це займе до хвилини ⏳');
      return; // Блокуємо подальшу обробку
    }
    
    // Для фото - показуємо повідомлення
    if (ctx.updateType === 'message' && ctx.message?.photo) {
      await ctx.reply('⏳ Зараз генерую твоє фото, зачекай трохи... Це займе до хвилини ⏳');
      return; // Блокуємо подальшу обробку
    }
    
    // Для тексту (окрім кастомного стилю) - показуємо повідомлення
    if (ctx.updateType === 'message' && ctx.message?.text) {
      // Перевіряємо, чи це не побажання для кастомного стилю
      const session = getSession(ctx.from.id);
      const isCustomStyleInput = session && session.style === 'custom' && !session.customWishes;
      
      if (!isCustomStyleInput) {
        await ctx.reply('⏳ Зараз генерую твоє фото, зачекай трохи... Це займе до хвилини ⏳');
        return; // Блокуємо подальшу обробку
      }
    }
  }
  
  // Якщо генерація не триває або це дозволений випадок - продовжуємо
  return next();
});

// Реєстрація всіх обробників
registerCommands(bot);
registerPhotoHandlers(bot);
registerCallbacks(bot);
registerTextHandlers(bot);

// Обробка помилок
bot.catch((err, ctx) => {
  console.error('Error in bot:', err);
  ctx.reply('❌ Виникла несподівана помилка. Спробуй ще раз пізніше.');
});

// Налаштування меню команд
const setupCommands = async () => {
  try {
    await bot.telegram.setMyCommands([]);
    console.log('✅ Меню команд налаштовано');
  } catch (error) {
    console.error('⚠️ Помилка налаштування команд:', error);
  }
};

// Запускаємо webhook сервер
const webhookApp = createWebhookServer(bot);
startWebhookServer(webhookApp);

// Запуск бота
console.log('🤖 Запуск бота...');

setupCommands().then(() => {
  return bot.launch();
}).then(() => {
  console.log('✅ Бот запущено успішно!');
}).catch((err) => {
  console.error('❌ Помилка запуску бота:', err);
  console.error('⚠️ Webhook сервер продовжує працювати, але бот недоступний');
});

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  process.exit(0);
});
