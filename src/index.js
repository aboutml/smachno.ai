import { Telegraf, Markup } from 'telegraf';
import express from 'express';
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
    
    // Перевіряємо, скільки оплачених генерацій доступно
    const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

    console.log(`[photo] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}, available paid: ${availablePaidGenerations}`);

    // Якщо немає безкоштовних генерацій І немає доступних оплачених - потрібна оплата
    if (!canGenerateFree && availablePaidGenerations === 0) {
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

    // Визначаємо, чи це безкоштовна чи оплачена генерація
    const isFreeGeneration = canGenerateFree;
    
    if (isFreeGeneration) {
      // Оновлюємо лічильник безкоштовних генерацій
      await db.incrementFreeGenerations(ctx.from.id);
      
      const remainingFree = config.app.freeGenerations - ((user?.free_generations_used || 0) + 1);
      if (remainingFree > 0) {
        await ctx.reply(
          `🎁 Залишилось безкоштовних генерацій: ${remainingFree}\n\n` +
          `Після вичерпання безкоштовних генерацій кожна наступна коштуватиме ${config.payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації).`
        );
      } else {
        await ctx.reply(
          `💳 Безкоштовні генерації вичерпано.\n\n` +
          `Наступні креативи коштуватимуть ${config.payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації за оплату).`
        );
      }
    } else {
      // Оновлюємо лічильник оплачених генерацій
      await db.incrementPaidGenerations(ctx.from.id);
      
      // Отримуємо оновлену кількість доступних оплачених генерацій
      const updatedAvailablePaid = await db.getAvailablePaidGenerations(ctx.from.id);
      
      if (updatedAvailablePaid > 0) {
        await ctx.reply(
          `💳 Використано 1 оплачену генерацію.\n\n` +
          `Залишилось оплачених генерацій: ${updatedAvailablePaid}`
        );
      } else {
        await ctx.reply(
          `💳 Використано останню оплачену генерацію.\n\n` +
          `Для наступних креативів потрібна оплата ${config.payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації).`
        );
      }
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
    
    // Перевіряємо, скільки оплачених генерацій доступно
    const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

    console.log(`[text] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}, available paid: ${availablePaidGenerations}`);

    // Якщо немає безкоштовних генерацій І немає доступних оплачених - потрібна оплата
    if (!canGenerateFree && availablePaidGenerations === 0) {
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

    // Визначаємо, чи це безкоштовна чи оплачена генерація
    const isFreeGeneration = canGenerateFree;
    
    if (isFreeGeneration) {
      // Оновлюємо лічильник безкоштовних генерацій
      await db.incrementFreeGenerations(ctx.from.id);
      
      const remainingFree = config.app.freeGenerations - ((user?.free_generations_used || 0) + 1);
      if (remainingFree > 0) {
        await ctx.reply(
          `🎁 Залишилось безкоштовних генерацій: ${remainingFree}`
        );
      } else {
        await ctx.reply(
          `💳 Безкоштовні генерації вичерпано.\n\n` +
          `Наступні креативи коштуватимуть ${config.payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації за оплату).`
        );
      }
    } else {
      // Оновлюємо лічильник оплачених генерацій
      await db.incrementPaidGenerations(ctx.from.id);
      
      // Отримуємо оновлену кількість доступних оплачених генерацій
      const updatedAvailablePaid = await db.getAvailablePaidGenerations(ctx.from.id);
      
      if (updatedAvailablePaid > 0) {
        await ctx.reply(
          `💳 Використано 1 оплачену генерацію.\n\n` +
          `Залишилось оплачених генерацій: ${updatedAvailablePaid}`
        );
      } else {
        await ctx.reply(
          `💳 Використано останню оплачену генерацію.\n\n` +
          `Для наступних креативів потрібна оплата ${config.payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації).`
        );
      }
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

// Запускаємо webhook сервер
const webhookApp = express();

// Спочатку парсимо body, потім логуємо
webhookApp.use(express.json());
webhookApp.use(express.urlencoded({ extended: true }));

// Middleware для логування всіх запитів (для діагностики)
// Розміщуємо ПІСЛЯ парсерів body, щоб бачити розпарсені дані
webhookApp.use((req, res, next) => {
  console.log(`[Webhook] ${new Date().toISOString()} ${req.method} ${req.path}`, {
    query: req.query,
    body: req.body ? (typeof req.body === 'object' ? Object.keys(req.body) : req.body) : 'no body',
    contentType: req.headers['content-type'],
    ip: req.ip || req.connection.remoteAddress,
  });
  next();
});

// Webhook endpoint для WayForPay
webhookApp.post('/payment/webhook', async (req, res) => {
  try {
    // Логуємо всі дані для діагностики
    console.log('[payment/webhook] Request received:', {
      method: req.method,
      headers: req.headers,
      contentType: req.headers['content-type'],
      body: req.body,
      rawBody: typeof req.body,
      query: req.query,
    });
    
    // WayForPay надсилає дані в особливому форматі:
    // JSON рядок як ключ об'єкта в form-urlencoded форматі
    // JSON обрізається на "products": і products передаються окремо
    // Структура: { '{"merchantAccount":"...","products":': { '{"name":"...","price":...}': '' } }
    let bodyData = {};
    
    if (req.body && typeof req.body === 'object') {
      // Отримуємо всі ключі body
      const bodyKeys = Object.keys(req.body);
      
      if (bodyKeys.length > 0) {
        try {
          // Перший ключ - це JSON з основними даними (обрізаний на "products":)
          const mainDataKey = bodyKeys[0];
          
          // Якщо є вкладені дані (products), об'єднуємо їх
          let productsJson = '';
          if (req.body[mainDataKey] && typeof req.body[mainDataKey] === 'object') {
            const nestedKeys = Object.keys(req.body[mainDataKey]);
            if (nestedKeys.length > 0) {
              // Products передаються як JSON рядок у вкладеному ключі
              productsJson = nestedKeys[0];
            }
          }
          
          // Об'єднуємо обрізаний JSON з products
          // mainDataKey закінчується на "products":, тому замінюємо ":" на ":["
          let fullJsonString = mainDataKey.trim();
          
          if (productsJson) {
            // Замінюємо останнє "products": на "products":[
            if (fullJsonString.endsWith('"products":')) {
              // Видаляємо ":" і додаємо ":["
              fullJsonString = fullJsonString.slice(0, -1) + ':[';
            } else if (fullJsonString.endsWith('"products": ')) {
              // Видаляємо ": " і додаємо ":["
              fullJsonString = fullJsonString.slice(0, -2) + ':[';
            } else if (fullJsonString.endsWith(':')) {
              // Якщо просто закінчується на ":", замінюємо на ":["
              fullJsonString = fullJsonString.slice(0, -1) + ':[';
            }
            // Додаємо products JSON і закриваємо масив та об'єкт
            fullJsonString += productsJson + ']}';
          } else {
            // Якщо немає products, замінюємо ":" на "[]}"
            if (fullJsonString.endsWith('"products":')) {
              fullJsonString = fullJsonString.slice(0, -1) + '[]}';
            } else if (fullJsonString.endsWith(':')) {
              fullJsonString = fullJsonString.slice(0, -1) + '[]}';
            } else if (!fullJsonString.endsWith('}')) {
              fullJsonString += '}';
            }
          }
          
          console.log('[payment/webhook] Full JSON string:', fullJsonString.substring(0, 200) + '...');
          
          // Парсимо повний JSON
          bodyData = JSON.parse(fullJsonString);
          console.log('[payment/webhook] Parsed body data:', bodyData);
        } catch (error) {
          console.error('[payment/webhook] Error parsing WayForPay body format:', error);
          console.error('[payment/webhook] Main data key:', bodyKeys[0]);
          console.error('[payment/webhook] Nested data:', req.body[bodyKeys[0]]);
          // Спробуємо використати body як є (якщо це стандартний формат)
          bodyData = req.body;
        }
      } else {
        bodyData = req.body;
      }
    }
    
    const {
      merchantAccount,
      orderReference,
      amount,
      currency,
      authCode,
      cardPan,
      transactionStatus,
      reasonCode,
      merchantSignature,
    } = bodyData;

    // Перевіряємо наявність обов'язкових полів
    if (!merchantAccount || !orderReference || !merchantSignature) {
      console.error('[payment/webhook] Missing required fields:', {
        hasMerchantAccount: !!merchantAccount,
        hasOrderReference: !!orderReference,
        hasMerchantSignature: !!merchantSignature,
        bodyKeys: Object.keys(bodyData),
      });
      return res.status(400).send('Missing required fields');
    }
    
    console.log('[payment/webhook] Processing webhook:', {
      merchantAccount,
      orderReference,
      amount,
      currency,
      transactionStatus,
      reasonCode,
    });
    
    // Спробуємо використати обидва ключі для верифікації
    const secretKeyToUse = config.payment.wayForPayMerchantPassword || config.payment.wayForPaySecretKey;
    
    // Перевіряємо підпис
    let isValid = paymentService.verifyWayForPaySignature(
      {
        merchantAccount,
        orderReference,
        amount,
        currency,
        authCode: authCode || '',
        cardPan: cardPan || '',
        transactionStatus,
        reasonCode: reasonCode || '',
      },
      merchantSignature,
      secretKeyToUse
    );
    
    // Якщо не спрацювало з першим ключем, спробуємо другий
    if (!isValid && config.payment.wayForPaySecretKey && config.payment.wayForPayMerchantPassword) {
      console.log('[payment/webhook] Trying alternative key for signature verification');
      const alternativeKey = secretKeyToUse === config.payment.wayForPaySecretKey 
        ? config.payment.wayForPayMerchantPassword 
        : config.payment.wayForPaySecretKey;
      isValid = paymentService.verifyWayForPaySignature(
        {
          merchantAccount,
          orderReference,
          amount,
          currency,
          authCode: authCode || '',
          cardPan: cardPan || '',
          transactionStatus,
          reasonCode: reasonCode || '',
        },
        merchantSignature,
        alternativeKey
      );
    }

    if (!isValid) {
      console.error('Invalid WayForPay signature');
      return res.status(400).send('Invalid signature');
    }

    // Оновлюємо статус платежу в БД
    // paymentId = orderReference (це унікальний ID платежу)
    const paymentId = orderReference;
    
    // Визначаємо статус на основі transactionStatus
    let status = 'pending';
    if (transactionStatus === 'Approved') {
      status = 'completed';
    } else if (transactionStatus === 'Refunded') {
      status = 'refunded';
    } else if (transactionStatus === 'Declined' || transactionStatus === 'Expired') {
      status = 'failed';
    }
    
    // Витягуємо userId з orderReference для створення платежу, якщо його немає
    let userId = null;
    const match = orderReference.match(/creative_(\d+)_/);
    if (match) {
      userId = parseInt(match[1]);
    }
    
    // Оновлюємо статус платежу та отримуємо інформацію про старий статус
    let wasAlreadyCompleted = false;
    if (paymentId) {
      // amount приходить в гривнях від WayForPay, конвертуємо в копійки для БД
      const amountInKopecks = Math.round((amount || 0) * 100);
      
      // Спочатку перевіряємо поточний статус платежу через database.js
      const existingPayment = await db.getPaymentByPaymentId(paymentId);
      wasAlreadyCompleted = existingPayment?.status === 'completed';
      
      // Оновлюємо статус
      await db.updatePaymentStatus(paymentId, status, userId, amountInKopecks, currency);
    }

    // Якщо платіж успішний І це перший раз (не був вже completed), повідомляємо користувача
    if (transactionStatus === 'Approved' && !wasAlreadyCompleted) {
      const match = orderReference.match(/creative_(\d+)_/);
      if (match) {
        const telegramId = parseInt(match[1]);
        try {
          console.log(`[payment/webhook] Sending success message to user ${telegramId} for payment ${orderReference}`);
          await bot.telegram.sendMessage(
            telegramId,
            '✅ Оплата успішна! Тепер ти можеш створити новий креатив. Надішли фото або опиши свій виріб.'
          );
        } catch (error) {
          console.error('Error sending message to user:', error);
        }
      }
    } else if (transactionStatus === 'Approved' && wasAlreadyCompleted) {
      console.log(`[payment/webhook] Payment ${orderReference} was already completed, skipping notification`);
    }

    // WayForPay очікує відповідь у форматі: { "orderReference": "...", "status": "accept" }
    // Це підтверджує, що ми отримали та обробили webhook
    console.log('[payment/webhook] Sending success response to WayForPay');
    res.status(200).json({ orderReference, status: 'accept' });
  } catch (error) {
    console.error('Error processing WayForPay webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Callback endpoint для redirect після оплати
// WayForPay може робити як GET, так і POST запити на цей endpoint
const handlePaymentCallback = async (req, res) => {
  try {
    // WayForPay може надсилати дані різними способами:
    // 1. GET з параметрами в URL (query)
    // 2. POST з form-urlencoded body
    // 3. POST з JSON body
    // 4. Redirect з параметрами в URL
    
    // Логуємо всі дані для діагностики
    console.log('[payment/callback] Request received:', {
      method: req.method,
      headers: req.headers,
      contentType: req.headers['content-type'],
      query: req.query,
      body: req.body,
      rawBody: typeof req.body,
    });
    
    // Спробуємо отримати дані з різних джерел
    let orderReference = req.query.orderReference || req.body?.orderReference;
    let transactionStatus = req.query.transactionStatus || req.body?.transactionStatus;
    
    // Якщо дані не знайдені, спробуємо парсити URL параметри з самого URL
    if (!orderReference && req.url) {
      const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
      orderReference = orderReference || urlParams.get('orderReference');
      transactionStatus = transactionStatus || urlParams.get('transactionStatus');
    }
    
    // Якщо все ще немає даних, але є body як рядок, спробуємо парсити
    if (!orderReference && typeof req.body === 'string') {
      try {
        const parsedBody = JSON.parse(req.body);
        orderReference = orderReference || parsedBody.orderReference;
        transactionStatus = transactionStatus || parsedBody.transactionStatus;
      } catch (e) {
        // Не JSON, спробуємо як URL-encoded
        try {
          const urlParams = new URLSearchParams(req.body);
          orderReference = orderReference || urlParams.get('orderReference');
          transactionStatus = transactionStatus || urlParams.get('transactionStatus');
        } catch (e2) {
          // Ігноруємо помилки парсингу
        }
      }
    }
    
    console.log('[payment/callback] Extracted data:', {
      orderReference,
      transactionStatus,
    });
    
    // Якщо немає transactionStatus, але є orderReference, перевіряємо статус в БД
    // Відповідно до документації WayForPay, callback (returnUrl) використовується тільки для перенаправлення користувача
    // Реальна обробка платежу відбувається через serviceUrl (webhook)
    if (!transactionStatus && orderReference) {
      const payment = await db.getPaymentByPaymentId(orderReference);
      if (payment) {
        // Якщо платіж вже оброблений webhook'ом і має статус completed, показуємо успіх
        if (payment.status === 'completed') {
          transactionStatus = 'Approved';
          console.log('[payment/callback] Payment found in DB with completed status, showing success page');
        } else {
          // Якщо платіж не completed, показуємо помилку
          transactionStatus = payment.status === 'refunded' ? 'Refunded' : 'Declined';
          console.log('[payment/callback] Payment found in DB with status:', payment.status);
        }
      } else {
        // Якщо платіж не знайдено, але webhook міг обробити його, показуємо успіх за замовчуванням
        console.log('[payment/callback] Payment not found in DB, but webhook may have processed it, showing success');
        transactionStatus = 'Approved';
      }
    }
    
    // Якщо немає ні orderReference, ні transactionStatus, показуємо успіх за замовчуванням
    // (оскільки webhook вже обробив платіж, якщо він був успішним)
    if (!transactionStatus && !orderReference) {
      console.log('[payment/callback] No data received, but webhook should have processed payment, showing success');
      transactionStatus = 'Approved';
    }
    
    // Відповідно до документації WayForPay, callback (returnUrl) використовується тільки для перенаправлення користувача
    // Реальна обробка платежу відбувається через serviceUrl (webhook)
    // Тому якщо webhook вже обробив платіж, показуємо успіх
    if (transactionStatus === 'Approved' || transactionStatus === 'completed') {
      res.send(`
        <html>
          <head>
            <title>Оплата успішна</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5;">
            <div style="background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #4CAF50; margin-bottom: 20px;">✅ Оплата успішна!</h1>
              <p style="font-size: 16px; color: #333; margin-bottom: 30px;">Поверніться до Telegram-бота та створіть новий креатив.</p>
              <p style="color: #666; font-size: 14px;">Ви можете закрити цю сторінку.</p>
            </div>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
          <head>
            <title>Помилка оплати</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5;">
            <div style="background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #f44336; margin-bottom: 20px;">❌ Помилка оплати</h1>
              <p style="font-size: 16px; color: #333; margin-bottom: 30px;">Спробуйте ще раз або зверніться до підтримки.</p>
              <p style="color: #666; font-size: 14px;">Ви можете закрити цю сторінку.</p>
            </div>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('[payment/callback] Error processing payment callback:', error);
    res.status(500).send(`
      <html>
        <head><title>Помилка</title><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Помилка обробки запиту</h1>
          <p>Спробуйте ще раз пізніше.</p>
        </body>
      </html>
    `);
  }
};

// Обробляємо як GET, так і POST запити
webhookApp.get('/payment/callback', handlePaymentCallback);
webhookApp.post('/payment/callback', handlePaymentCallback);

// Health check endpoint (для Railway та інших платформ)
webhookApp.get('/health', (req, res) => {
  try {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'Смачно.AI Webhook Server',
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('[health] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Додатковий endpoint для Railway health check
webhookApp.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Функція для екранування HTML
const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Проміжна сторінка для WayForPay widget (POST форма)
webhookApp.get('/payment/form/:orderReference', async (req, res) => {
  try {
    console.log('[payment/form] Request received:', req.params, req.query);
    
    const { orderReference } = req.params;
    
    if (!orderReference) {
      console.error('[payment/form] Missing orderReference');
      return res.status(400).send('Missing orderReference');
    }
    
    // Перевіряємо наявність конфігурації
    if (!config.payment.wayForPayMerchantAccount || !config.payment.wayForPaySecretKey) {
      console.error('[payment/form] WayForPay not configured');
      return res.status(500).send('Payment service not configured');
    }
    
    // Отримуємо дані з query параметрів
    // ВАЖЛИВО: orderDate має бути однаковим для підпису та форми!
    const orderDate = parseInt(req.query.orderDate) || Math.floor(Date.now() / 1000);
    const amount = parseInt(req.query.amount) || config.payment.amount * 100;
    
    const paymentData = {
      merchantAccount: req.query.merchantAccount || config.payment.wayForPayMerchantAccount,
      merchantDomainName: req.query.merchantDomainName || config.payment.merchantDomainName,
      orderReference: orderReference,
      orderDate: orderDate, // Фіксуємо orderDate
      amount: amount,
      currency: req.query.currency || config.payment.currency,
      // Використовуємо латиницю для тестування (кирилиця може викликати проблеми з підписом)
      productName: [req.query.productName || process.env.WAYFORPAY_PRODUCT_NAME || 'Generation of creative for Instagram'],
      productCount: [1], // ВАЖЛИВО: завжди 1, не amount!
      productPrice: [amount], // Ціна в копійках
      returnUrl: req.query.returnUrl || `${process.env.APP_URL || 'https://your-app.com'}/payment/callback`,
      serviceUrl: req.query.serviceUrl || `${process.env.APP_URL || 'https://your-app.com'}/payment/webhook`,
    };
    
    console.log('[payment/form] Payment data prepared:', {
      merchantAccount: paymentData.merchantAccount,
      orderReference: paymentData.orderReference,
      amount: paymentData.amount,
      orderDate: paymentData.orderDate,
    });
    
    // Створюємо підпис (ВАЖЛИВО: використовуємо той самий orderDate!)
    if (!paymentService || !paymentService.createWayForPaySignature) {
      console.error('[payment/form] PaymentService not available');
      return res.status(500).send('Payment service not available');
    }
    
    console.log('[payment/form] Creating signature with orderDate:', paymentData.orderDate);
    // Для widget форми використовуємо isWidget = true
    // Спробуємо використати MERCHANT PASSWORD, якщо він є
    const secretKeyToUse = config.payment.wayForPayMerchantPassword || config.payment.wayForPaySecretKey;
    const signature = paymentService.createWayForPaySignature(paymentData, secretKeyToUse, true);
    paymentData.merchantSignature = signature;
    console.log('[payment/form] Signature created:', signature.substring(0, 10) + '...');
    
    console.log('[payment/form] Signature created, generating HTML form...');
    
    // Використовуємо готову форму WayForPay (дефолтна сторінка WayForPay)
    // Форма автоматично відправляє POST на https://secure.wayforpay.com/pay
    const html = `<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Перенаправлення на оплату...</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .loader {
            text-align: center;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <p>Перенаправлення на сторінку оплати...</p>
    </div>
    <form id="wayforpayForm" method="POST" action="https://secure.wayforpay.com/pay">
        <input type="hidden" name="merchantAccount" value="${escapeHtml(paymentData.merchantAccount)}">
        <input type="hidden" name="merchantDomainName" value="${escapeHtml(paymentData.merchantDomainName)}">
        <input type="hidden" name="orderReference" value="${escapeHtml(paymentData.orderReference)}">
        <input type="hidden" name="orderDate" value="${escapeHtml(String(paymentData.orderDate))}">
        <input type="hidden" name="amount" value="${escapeHtml(String(paymentData.amount))}">
        <input type="hidden" name="currency" value="${escapeHtml(paymentData.currency)}">
        <input type="hidden" name="productName[]" value="${escapeHtml(paymentData.productName[0])}">
        <input type="hidden" name="productCount[]" value="${escapeHtml(String(paymentData.productCount[0]))}">
        <input type="hidden" name="productPrice[]" value="${escapeHtml(String(paymentData.productPrice[0]))}">
        <input type="hidden" name="returnUrl" value="${escapeHtml(paymentData.returnUrl)}">
        <input type="hidden" name="serviceUrl" value="${escapeHtml(paymentData.serviceUrl)}">
        <input type="hidden" name="merchantSignature" value="${escapeHtml(paymentData.merchantSignature)}">
    </form>
    <script>
        // Автоматично відправляємо форму
        document.getElementById('wayforpayForm').submit();
    </script>
</body>
</html>`;

    console.log('[payment/form] HTML form generated, sending response...');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('[payment/form] Error:', error);
    console.error('[payment/form] Error stack:', error.stack);
    res.status(500).send(`
      <html>
        <head><title>Помилка</title><meta charset="UTF-8"></head>
        <body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;">
          <h1>Помилка створення форми оплати</h1>
          <p>${escapeHtml(error.message)}</p>
        </body>
      </html>
    `);
  }
});

// Root endpoint для Railway health check
webhookApp.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'Смачно.AI Bot & Webhook Server',
    timestamp: new Date().toISOString() 
  });
});

// Запускаємо webhook сервер спочатку (незалежно від бота)
console.log('🌐 Запуск webhook сервера...');
const PORT = config.app.port || process.env.PORT || 3000;
console.log(`[Webhook] Використовується порт: ${PORT}`);
console.log(`[Webhook] APP_URL: ${process.env.APP_URL || 'не встановлено'}`);
console.log(`[Webhook] Express app готовий, кількість routes: ${webhookApp._router?.stack?.length || 'невідомо'}`);

// Перевіряємо, чи webhookApp правильно ініціалізований
if (!webhookApp) {
  console.error('❌ webhookApp не ініціалізований!');
} else {
  console.log('[Webhook] webhookApp ініціалізований успішно');
}

// Додаємо обробник помилок для сервера ПЕРЕД викликом listen
let server;
try {
  console.log(`[Webhook] Викликаємо listen() на порту ${PORT}...`);
  server = webhookApp.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Webhook server запущено на порту ${PORT}`);
    console.log(`📡 Payment webhook: ${process.env.APP_URL || 'https://your-domain.com'}/payment/webhook`);
    console.log(`🔗 Payment callback: ${process.env.APP_URL || 'https://your-domain.com'}/payment/callback`);
    console.log(`🏥 Health check: ${process.env.APP_URL || 'https://your-domain.com'}/health`);
    console.log(`🌍 Root endpoint: ${process.env.APP_URL || 'https://your-domain.com'}/`);
    console.log(`[Webhook] Server listening on 0.0.0.0:${PORT}`);
  });
  
  console.log('[Webhook] listen() викликано, очікуємо callback...');
  
  server.on('error', (error) => {
    console.error('❌ Помилка webhook сервера:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Порт ${PORT} вже використовується!`);
    } else {
      console.error('❌ Error code:', error.code);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
    }
  });

  server.on('listening', () => {
    const addr = server.address();
    console.log(`[Webhook] Server is listening on ${addr.address}:${addr.port}`);
  });
  
  // Перевіряємо стан сервера через невеликий таймаут
  setTimeout(() => {
    if (server && server.listening) {
      console.log(`[Webhook] ✅ Сервер точно працює на порту ${PORT}`);
    } else {
      console.warn(`[Webhook] ⚠️ Сервер може не працювати. Стан:`, {
        listening: server?.listening,
        address: server?.address(),
      });
    }
  }, 1000);
  
} catch (error) {
  console.error('❌ Помилка при виклику listen():', error);
  console.error('❌ Error details:', error.message);
  console.error('❌ Error stack:', error.stack);
}

// Запуск бота
console.log('🤖 Запуск бота...');

setupCommands().then(() => {
  return bot.launch();
}).then(() => {
  console.log('✅ Бот запущено успішно!');
}).catch((err) => {
  console.error('❌ Помилка запуску бота:', err);
  // Не завершуємо процес, щоб webhook сервер продовжував працювати
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

