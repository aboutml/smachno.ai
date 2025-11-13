import { Telegraf, Markup } from 'telegraf';
import { config } from './config.js';
import { db } from './db/database.js';
import { aiService } from './services/ai.js';
import { paymentService } from './services/payment.js';
import { storageService } from './services/storage.js';

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

// Команда /start
bot.command('start', async (ctx) => {
  const user = ctx.from;
  
  // Створюємо або оновлюємо користувача
  await db.createOrUpdateUser(user.id, {
    username: user.username,
    first_name: user.first_name || user.first_name,
  });

  const welcomeMessage = `🍰 Привіт, ${user.first_name || 'користувач'}!

Я **Смачно.AI** — допоможу створити стильні креативи для твоєї пекарні або кав'ярні! 

📸 **Як це працює:**
1. Надішли фото свого виробу або опиши його текстом
2. Я згенерую 1-2 варіанти креативів у стилі Instagram-посту
3. Отримаєш готовий підпис до посту українською

🎁 **Перші ${config.app.freeGenerations} генерації — безкоштовно!**

Надішли фото або опиши свій виріб, і почнемо! ✨`;

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [
          { text: '📸 Мої креативи' },
          { text: '❓ Допомога' }
        ]
      ],
      resize_keyboard: true,
    },
  });
});

// Команда /help - допомога
bot.command('help', async (ctx) => {
  const helpMessage = `📋 <b>Доступні команди:</b>

/start - Початок роботи з ботом
/my_creatives - Переглянути мої креативи
/help - Показати це меню допомоги

📸 <b>Як створити креатив:</b>
• Надішли фото свого виробу
• Або опиши текстом, що хочеш створити

🎁 <b>Безкоштовні генерації:</b>
Перші ${config.app.freeGenerations} креативи — безкоштовно!
Після цього кожен креатив коштує ${config.payment.amount} грн.

💡 <b>Поради:</b>
• Чим детальніший опис, тим кращий результат
• Фото має бути якісним та добре освітленим
• Можна створити кілька варіантів для одного виробу`;

  await ctx.reply(helpMessage, {
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        [
          { text: '📸 Мої креативи' },
          { text: '❓ Допомога' }
        ]
      ],
      resize_keyboard: true,
    },
  });
});

// Команда /my_creatives - галерея креативів
bot.command('my_creatives', async (ctx) => {
  try {
    const creatives = await db.getUserCreatives(ctx.from.id, 5);
    console.log(`[my_creatives] User ${ctx.from.id}, found ${creatives.length} creatives`);

    const menuKeyboard = {
      keyboard: [
        [
          { text: '📸 Мої креативи' },
          { text: '❓ Допомога' }
        ]
      ],
      resize_keyboard: true,
    };

    if (creatives.length === 0) {
      await ctx.reply('📭 У тебе ще немає створених креативів.\n\nНадішли фото або опиши свій виріб, щоб створити перший креатив!', {
        reply_markup: menuKeyboard,
      });
      return;
    }

    await ctx.reply(`📸 Твої останні креативи (${creatives.length}):`, {
      reply_markup: menuKeyboard,
    });

    for (const creative of creatives) {
      try {
        console.log(`[my_creatives] Processing creative ${creative.id}, URL: ${creative.generated_image_url}`);
        
        if (creative.generated_image_url) {
          const caption = creative.caption 
            ? `${creative.caption}\n\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`
            : `📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`;
          
          console.log(`[my_creatives] Sending photo with URL: ${creative.generated_image_url}`);
          await ctx.replyWithPhoto(creative.generated_image_url, {
            caption: caption.substring(0, 1024), // Telegram обмеження
          });
          console.log(`[my_creatives] Successfully sent creative ${creative.id}`);
        } else {
          console.warn(`[my_creatives] Creative ${creative.id} has no image URL`);
          // Відправляємо повідомлення навіть без зображення
          await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`);
        }
      } catch (error) {
        console.error(`[my_creatives] Error sending creative ${creative.id}:`, error);
        console.error(`[my_creatives] Error details:`, error.message);
        // Спробуємо відправити як повідомлення, якщо фото не вдалося
        try {
          await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}\n\n⚠️ Не вдалося завантажити зображення`);
        } catch (e) {
          console.error(`[my_creatives] Failed to send fallback message:`, e);
        }
      }
    }
  } catch (error) {
    console.error('[my_creatives] Error:', error);
    await ctx.reply('❌ Виникла помилка при завантаженні креативів. Спробуй ще раз пізніше.');
  }
});

// Команда /stats - статистика (тільки для адмінів)
bot.command('stats', async (ctx) => {
  if (!config.admin.userIds.includes(ctx.from.id)) {
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
bot.command('broadcast', async (ctx) => {
  if (!config.admin.userIds.includes(ctx.from.id)) {
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

// Обробка фото
bot.on('photo', async (ctx) => {
  try {
    // Перевіряємо ліміт ПЕРЕД обробкою фото
    const user = await db.getUserByTelegramId(ctx.from.id);
    const freeGenerationsUsed = user?.free_generations_used || 0;
    const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;

    console.log(`[photo] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}`);

    if (!canGenerateFree) {
      // Потрібна оплата - показуємо кнопку одразу
      try {
        const payment = await paymentService.createPayment(ctx.from.id);
        
        // Зберігаємо інформацію про платіж
        const userData = await db.createOrUpdateUser(ctx.from.id, {
          username: ctx.from.username,
          first_name: ctx.from.first_name,
        });
        await db.createPayment(userData.id, payment.amount * 100, config.payment.currency, payment.orderId);
        
        await ctx.reply(
          `💰 Для створення креативу потрібна оплата ${payment.amount} грн.\n\n` +
          `Натисни кнопку нижче для оплати:`,
          Markup.inlineKeyboard([
            Markup.button.url('💳 Оплатити', payment.checkoutUrl),
          ])
        );
        return;
      } catch (paymentError) {
        console.error('[photo] Payment creation error:', paymentError);
        await ctx.reply(
          `💰 Для створення креативу потрібна оплата ${config.payment.amount} грн.\n\n` +
          `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`
        );
        return;
      }
    }

    await ctx.reply('⏳ Обробляю фото та генерую креатив...');

    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Найбільше фото
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;

    // Зберігаємо оригінальне фото
    const originalPhotoUrl = await storageService.uploadFromTelegram(
      fileUrl,
      `${ctx.from.id}_${Date.now()}.jpg`
    );

    // Аналізуємо фото
    const imageDescription = await aiService.analyzeImage(originalPhotoUrl);
    
    // Генеруємо зображення
    const prompt = `Instagram-style food photography: ${imageDescription}`;
    const generatedImages = await aiService.generateImage(prompt, 2);

    // Генеруємо підпис
    const caption = await aiService.generateCaption(imageDescription, prompt);

    // Зберігаємо креативи
    const userData = await db.createOrUpdateUser(ctx.from.id, {
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    });

    for (const imageUrl of generatedImages) {
      const savedImageUrl = await storageService.saveGeneratedImage(
        imageUrl,
        `${ctx.from.id}_${Date.now()}.png`
      );

      await db.saveCreative(userData.id, {
        originalPhotoUrl,
        prompt: imageDescription,
        generatedImageUrl: savedImageUrl,
        caption,
      });
    }

    // Відправляємо результат
    await ctx.reply('✨ Ось твої креативи:');

    for (let i = 0; i < generatedImages.length; i++) {
      const imageCaption = i === 0 
        ? `${caption}\n\n🎨 Варіант ${i + 1}`
        : `🎨 Варіант ${i + 1}`;

      await ctx.replyWithPhoto(generatedImages[i], {
        caption: imageCaption.substring(0, 1024),
      });
    }

    // Оновлюємо лічильник безкоштовних генерацій
    await db.incrementFreeGenerations(ctx.from.id);

    const remainingFree = config.app.freeGenerations - ((user?.free_generations_used || 0) + 1);
    if (remainingFree > 0) {
      await ctx.reply(
        `🎁 Залишилось безкоштовних генерацій: ${remainingFree}\n\n` +
        `Після вичерпання безкоштовних генерацій кожна наступна коштуватиме ${config.payment.amount} грн.`
      );
    } else {
      await ctx.reply(
        `💳 Безкоштовні генерації вичерпано.\n\n` +
        `Наступні креативи коштуватимуть ${config.payment.amount} грн.`
      );
    }

  } catch (error) {
    console.error('Error processing photo:', error);
    await ctx.reply('❌ Виникла помилка при обробці фото. Спробуй ще раз або звернись до підтримки.');
  }
});

// Обробка текстового запиту
bot.on('text', async (ctx) => {
  // Ігноруємо команди
  if (ctx.message.text.startsWith('/')) {
    return;
  }

  try {
    // Перевіряємо ліміт ПЕРЕД генерацією
    const user = await db.getUserByTelegramId(ctx.from.id);
    const freeGenerationsUsed = user?.free_generations_used || 0;
    const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;

    console.log(`[text] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}`);

    if (!canGenerateFree) {
      // Потрібна оплата - показуємо кнопку одразу
      try {
        const payment = await paymentService.createPayment(ctx.from.id);
        
        // Зберігаємо інформацію про платіж
        const userData = await db.createOrUpdateUser(ctx.from.id, {
          username: ctx.from.username,
          first_name: ctx.from.first_name,
        });
        await db.createPayment(userData.id, payment.amount * 100, config.payment.currency, payment.orderId);
        
        await ctx.reply(
          `💰 Для створення креативу потрібна оплата ${payment.amount} грн.\n\n` +
          `Натисни кнопку нижче для оплати:`,
          Markup.inlineKeyboard([
            Markup.button.url('💳 Оплатити', payment.checkoutUrl),
          ])
        );
        return;
      } catch (paymentError) {
        console.error('[text] Payment creation error:', paymentError);
        await ctx.reply(
          `💰 Для створення креативу потрібна оплата ${config.payment.amount} грн.\n\n` +
          `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`
        );
        return;
      }
    }

    await ctx.reply('⏳ Генерую креатив на основі твого опису...');

    const userPrompt = ctx.message.text;

    // Генеруємо зображення
    const generatedImages = await aiService.generateImage(userPrompt, 2);

    // Генеруємо підпис
    const caption = await aiService.generateCaption(userPrompt);

    // Зберігаємо креативи
    const userData = await db.createOrUpdateUser(ctx.from.id, {
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    });

    for (const imageUrl of generatedImages) {
      const savedImageUrl = await storageService.saveGeneratedImage(
        imageUrl,
        `${ctx.from.id}_${Date.now()}.png`
      );

      await db.saveCreative(userData.id, {
        originalPhotoUrl: null,
        prompt: userPrompt,
        generatedImageUrl: savedImageUrl,
        caption,
      });
    }

    // Відправляємо результат
    await ctx.reply('✨ Ось твої креативи:');

    for (let i = 0; i < generatedImages.length; i++) {
      const imageCaption = i === 0 
        ? `${caption}\n\n🎨 Варіант ${i + 1}`
        : `🎨 Варіант ${i + 1}`;

      await ctx.replyWithPhoto(generatedImages[i], {
        caption: imageCaption.substring(0, 1024),
      });
    }

    // Оновлюємо лічильник
    await db.incrementFreeGenerations(ctx.from.id);

    const remainingFree = config.app.freeGenerations - ((user?.free_generations_used || 0) + 1);
    if (remainingFree > 0) {
      await ctx.reply(
        `🎁 Залишилось безкоштовних генерацій: ${remainingFree}`
      );
    } else {
      await ctx.reply(
        `💳 Безкоштовні генерації вичерпано.\n\n` +
        `Наступні креативи коштуватимуть ${config.payment.amount} грн.`
      );
    }

  } catch (error) {
    console.error('Error processing text:', error);
    await ctx.reply('❌ Виникла помилка при генерації креативу. Спробуй ще раз або звернись до підтримки.');
  }
});

// Обробка помилок
bot.catch((err, ctx) => {
  console.error('Error in bot:', err);
  ctx.reply('❌ Виникла несподівана помилка. Спробуй ще раз пізніше.');
});

// Налаштування меню команд
const setupCommands = async () => {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Початок роботи з ботом' },
      { command: 'my_creatives', description: 'Мої креативи' },
      { command: 'help', description: 'Допомога та інструкції' },
    ]);
    console.log('✅ Меню команд налаштовано');
  } catch (error) {
    console.error('⚠️ Помилка налаштування команд:', error);
  }
};

// Обробка кнопок меню
bot.hears('📸 Мої креативи', async (ctx) => {
  try {
    // Викликаємо команду /my_creatives
    const creatives = await db.getUserCreatives(ctx.from.id, 5);
    console.log(`[button] User ${ctx.from.id}, found ${creatives.length} creatives`);

    const menuKeyboard = {
      keyboard: [
        [
          { text: '📸 Мої креативи' },
          { text: '❓ Допомога' }
        ]
      ],
      resize_keyboard: true,
    };

    if (creatives.length === 0) {
      await ctx.reply('📭 У тебе ще немає створених креативів.\n\nНадішли фото або опиши свій виріб, щоб створити перший креатив!', {
        reply_markup: menuKeyboard,
      });
      return;
    }

    await ctx.reply(`📸 Твої останні креативи (${creatives.length}):`, {
      reply_markup: menuKeyboard,
    });

    for (const creative of creatives) {
      try {
        console.log(`[button] Processing creative ${creative.id}, URL: ${creative.generated_image_url}`);
        
        if (creative.generated_image_url) {
          const caption = creative.caption 
            ? `${creative.caption}\n\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`
            : `📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`;
          
          console.log(`[button] Sending photo with URL: ${creative.generated_image_url}`);
          await ctx.replyWithPhoto(creative.generated_image_url, {
            caption: caption.substring(0, 1024),
          });
          console.log(`[button] Successfully sent creative ${creative.id}`);
        } else {
          console.warn(`[button] Creative ${creative.id} has no image URL`);
          await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`);
        }
      } catch (error) {
        console.error(`[button] Error sending creative ${creative.id}:`, error);
        console.error(`[button] Error details:`, error.message);
        try {
          await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}\n\n⚠️ Не вдалося завантажити зображення`);
        } catch (e) {
          console.error(`[button] Failed to send fallback message:`, e);
        }
      }
    }
  } catch (error) {
    console.error('[button] Error:', error);
    await ctx.reply('❌ Виникла помилка при завантаженні креативів. Спробуй ще раз пізніше.');
  }
});

bot.hears('❓ Допомога', async (ctx) => {
  // Викликаємо команду /help
  const helpMessage = `📋 <b>Доступні команди:</b>

/start - Початок роботи з ботом
/my_creatives - Переглянути мої креативи
/help - Показати це меню допомоги

📸 <b>Як створити креатив:</b>
• Надішли фото свого виробу
• Або опиши текстом, що хочеш створити

🎁 <b>Безкоштовні генерації:</b>
Перші ${config.app.freeGenerations} креативи — безкоштовно!
Після цього кожен креатив коштує ${config.payment.amount} грн.

💡 <b>Поради:</b>
• Чим детальніший опис, тим кращий результат
• Фото має бути якісним та добре освітленим
• Можна створити кілька варіантів для одного виробу`;

  await ctx.reply(helpMessage, {
    parse_mode: 'HTML',
    reply_markup: {
      keyboard: [
        [
          { text: '📸 Мої креативи' },
          { text: '❓ Допомога' }
        ]
      ],
      resize_keyboard: true,
    },
  });
});

// Запуск бота
console.log('🤖 Запуск бота...');
setupCommands().then(() => {
  return bot.launch();
}).then(() => {
  console.log('✅ Бот запущено успішно!');
}).catch((err) => {
  console.error('❌ Помилка запуску бота:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

