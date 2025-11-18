import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import { config } from './config.js';
import { db } from './db/database.js';
import { aiService } from './services/ai.js';
import { paymentService } from './services/payment.js';
import { storageService } from './services/storage.js';

// Зберігання стану користувачів (для MVP - в пам'яті)
// Структура: { telegramId: { photoUrl, style, customWishes, originalPhotoUrl } }
const userSessions = new Map();

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

Я **Смачно.AI** — допоможу покращити фото твоїх десертів та створити стильні креативи для Instagram! 

📸 **Як це працює:**
1. Надішли фото десерту
2. Обери стиль для покращення
3. Отримай 2 варіанти покращеного фото

🎁 **Перші ${config.app.freeGenerations} генерації — безкоштовно!**

Обери, що хочеш зробити:`;

  // Спочатку приховуємо будь-який persistent keyboard
  try {
    const removeMsg = await ctx.telegram.sendMessage(ctx.chat.id, '', {
      reply_markup: { remove_keyboard: true },
    }).catch(() => null);
    if (removeMsg) {
      await ctx.telegram.deleteMessage(ctx.chat.id, removeMsg.message_id).catch(() => {});
    }
  } catch (e) {}

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📸 Згенерувати фото десерту', callback_data: 'generate_photo' }],
        [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
        [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }],
        [{ text: '❓ Допомога', callback_data: 'help' }]
      ],
    },
  });
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
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Найбільше фото
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;

    // Зберігаємо оригінальне фото
    const originalPhotoUrl = await storageService.uploadFromTelegram(
      fileUrl,
      `${ctx.from.id}_${Date.now()}.jpg`
    );

    // Зберігаємо фото в сесії користувача
    userSessions.set(ctx.from.id, {
      originalPhotoUrl,
      photoUrl: originalPhotoUrl,
      style: null,
      customWishes: null,
    });

    // Спочатку приховуємо будь-який persistent keyboard
    try {
      const removeMsg = await ctx.telegram.sendMessage(ctx.chat.id, '', {
        reply_markup: { remove_keyboard: true },
      }).catch(() => null);
      if (removeMsg) {
        await ctx.telegram.deleteMessage(ctx.chat.id, removeMsg.message_id).catch(() => {});
      }
    } catch (e) {}

    // Показуємо вибір стилю з inline кнопками
    await ctx.reply(
      'Обери стиль для покращеного фото 👇',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🍓 Яскравий та соковитий', callback_data: 'style_bright' }],
            [{ text: '🧁 Преміум-кондитерська', callback_data: 'style_premium' }],
            [{ text: '☕ Затишна кав\'ярня', callback_data: 'style_cozy' }],
            [{ text: '🎂 Весільна естетика', callback_data: 'style_wedding' }],
            [{ text: '➕ Додати свої побажання', callback_data: 'style_custom' }],
            [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
          ],
        },
      }
    );

  } catch (error) {
    console.error('Error processing photo:', error);
    await ctx.reply('❌ Виникла помилка при обробці фото. Спробуй ще раз або звернись до підтримки.');
  }
});

// Обробка callback для вибору стилю
bot.action(/^style_(bright|premium|cozy|wedding|custom)$/, async (ctx) => {
  try {
    const style = ctx.match[1];
    const session = userSessions.get(ctx.from.id);
    
    if (!session || !session.originalPhotoUrl) {
      await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
      return;
    }

    // Оновлюємо стиль в сесії
    session.style = style;
    userSessions.set(ctx.from.id, session);

    if (style === 'custom') {
      // Якщо обрано кастомний стиль, просимо побажання
      await ctx.editMessageText(
        'Напиши додаткові побажання до стилю — що підкреслити, змінити чи додати.'
      );
      await ctx.answerCbQuery();
    } else {
      // Якщо обрано готовий стиль, одразу запускаємо генерацію
      await ctx.editMessageText('Чудово! Починаю генерувати 😋\n\nЦе займе близько 1 хвилини.');
      await ctx.answerCbQuery();
      
      // Запускаємо генерацію
      await processGeneration(ctx, session);
    }
  } catch (error) {
    console.error('Error handling style selection:', error);
    await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
  }
});

// Обробка callback для кнопок після генерації
bot.action('regenerate_same', async (ctx) => {
  try {
    const session = userSessions.get(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
      return;
    }
    
    // Показуємо вибір стилю знову
    await ctx.editMessageText('Обери стиль для покращеного фото 👇', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍓 Яскравий та соковитий', callback_data: 'style_bright' }],
          [{ text: '🧁 Преміум-кондитерська', callback_data: 'style_premium' }],
          [{ text: '☕ Затишна кав\'ярня', callback_data: 'style_cozy' }],
          [{ text: '🎂 Весільна естетика', callback_data: 'style_wedding' }],
          [{ text: '➕ Додати свої побажання', callback_data: 'style_custom' }],
          [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling regenerate:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('change_style', async (ctx) => {
  try {
    const session = userSessions.get(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
      return;
    }
    
    // Скидаємо стиль та показуємо вибір знову
    session.style = null;
    session.customWishes = null;
    userSessions.set(ctx.from.id, session);
    
    await ctx.editMessageText('Обери стиль для покращеного фото 👇', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍓 Яскравий та соковитий', callback_data: 'style_bright' }],
          [{ text: '🧁 Преміум-кондитерська', callback_data: 'style_premium' }],
          [{ text: '☕ Затишна кав\'ярня', callback_data: 'style_cozy' }],
          [{ text: '🎂 Весільна естетика', callback_data: 'style_wedding' }],
          [{ text: '➕ Додати свої побажання', callback_data: 'style_custom' }],
          [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling change style:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('new_photo', async (ctx) => {
  try {
    // Очищаємо сесію
    userSessions.delete(ctx.from.id);
    
    await ctx.editMessageText('Надішли нове фото десерту, який хочеш покращити 🍰✨');
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling new photo:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

// Обробка callback для стилів/пресетів
bot.action(/^style_(cakes|cupcakes|donuts|drinks|cookies|desserts)$/, async (ctx) => {
  try {
    const category = ctx.match[1];
    const categoryNames = {
      cakes: 'Торти',
      cupcakes: 'Капкейки',
      donuts: 'Пончики',
      drinks: 'Напої',
      cookies: 'Печиво',
      desserts: 'Десерти'
    };
    
    await ctx.editMessageText(
      `🍰 Приклади ${categoryNames[category]} для натхнення:\n\n` +
      `(Тут будуть показані приклади AI-фото)\n\n` +
      `Це лише для натхнення. Для генерації своїх фото натисни кнопку нижче 👇`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📸 Хочу згенерувати своє фото', callback_data: 'generate_own' }],
            [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
          ],
        },
      }
    );
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling style category:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('generate_own', async (ctx) => {
  try {
    await ctx.editMessageText('Надішли фото десерту, який хочеш покращити 🍰✨');
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling generate own:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

// Обробка callback для кнопок головного меню
bot.action('generate_photo', async (ctx) => {
  try {
    await ctx.editMessageText('Надішли фото десерту, який хочеш покращити 🍰✨', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling generate photo:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('styles_menu', async (ctx) => {
  try {
    const stylesMessage = `Обери категорію для натхнення 👇`;
    
    await ctx.editMessageText(stylesMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍰 Торти', callback_data: 'style_cakes' }],
          [{ text: '🧁 Капкейки', callback_data: 'style_cupcakes' }],
          [{ text: '🍩 Пончики', callback_data: 'style_donuts' }],
          [{ text: '☕ Напої', callback_data: 'style_drinks' }],
          [{ text: '🍪 Печиво', callback_data: 'style_cookies' }],
          [{ text: '🍮 Десерти', callback_data: 'style_desserts' }],
          [{ text: '📸 Хочу згенерувати своє фото', callback_data: 'generate_own' }],
          [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling styles menu:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('about', async (ctx) => {
  try {
    const aboutMessage = `🍰 <b>Смачно.AI</b>

Я допоможу покращити фото твоїх десертів та створити стильні креативи для Instagram!

✨ <b>Можливості:</b>
• Покращення фото десертів
• 4 готові стилі для обробки
• Завжди 2 варіанти результатів
• Генерація підписів до постів

🎁 <b>Безкоштовно:</b>
Перші ${config.app.freeGenerations} генерації — безкоштовно!
Після цього: ${config.payment.amount} грн за ${config.app.paidGenerationsPerPayment} генерації`;

    await ctx.editMessageText(aboutMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling about:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('settings', async (ctx) => {
  try {
    const settingsMessage = `⚙️ <b>Налаштування</b>

Обери опцію:`;

    await ctx.editMessageText(settingsMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Мої креативи', callback_data: 'my_creatives' }],
          [{ text: '🧩 Мова інтерфейсу: Українська', callback_data: 'language' }],
          [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling settings:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

// Обробка callback для "Мої креативи" з налаштувань
bot.action('my_creatives', async (ctx) => {
  try {
    const creatives = await db.getUserCreatives(ctx.from.id, 5);
    console.log(`[my_creatives callback] User ${ctx.from.id}, found ${creatives.length} creatives`);

    const menuKeyboard = {
      inline_keyboard: [
        [{ text: '📸 Згенерувати фото десерту', callback_data: 'generate_photo' }],
        [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
        [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }],
        [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
      ],
    };

    const creativeKeyboard = {
      inline_keyboard: [
        [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
      ],
    };

    if (creatives.length === 0) {
      await ctx.editMessageText('📭 У тебе ще немає створених креативів.\n\nНадішли фото десерту, щоб створити перший креатив!', {
        reply_markup: menuKeyboard,
      });
      await ctx.answerCbQuery();
      return;
    }

    await ctx.editMessageText(`📸 Твої останні креативи (${creatives.length}):`, {
      reply_markup: menuKeyboard,
    });
    await ctx.answerCbQuery();

    // Відправляємо креативи окремими повідомленнями
    for (let i = 0; i < creatives.length; i++) {
      const creative = creatives[i];
      const isLast = i === creatives.length - 1;
      
      try {
        console.log(`[my_creatives callback] Processing creative ${creative.id}, URL: ${creative.generated_image_url}`);
        
        if (creative.generated_image_url) {
          const caption = creative.caption 
            ? `${creative.caption}\n\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`
            : `📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`;
          
          console.log(`[my_creatives callback] Sending photo with URL: ${creative.generated_image_url}`);
          await ctx.replyWithPhoto(creative.generated_image_url, {
            caption: caption.substring(0, 1024),
            reply_markup: isLast ? creativeKeyboard : undefined,
          });
          console.log(`[my_creatives callback] Successfully sent creative ${creative.id}`);
        } else {
          console.warn(`[my_creatives callback] Creative ${creative.id} has no image URL`);
          await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`, {
            reply_markup: isLast ? creativeKeyboard : undefined,
          });
        }
      } catch (error) {
        console.error(`[my_creatives callback] Error sending creative ${creative.id}:`, error);
        try {
          await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}\n\n⚠️ Не вдалося завантажити зображення`, {
            reply_markup: isLast ? creativeKeyboard : undefined,
          });
        } catch (e) {
          console.error(`[my_creatives callback] Failed to send fallback message:`, e);
        }
      }
    }
  } catch (error) {
    console.error('[my_creatives callback] Error:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

bot.action('language', async (ctx) => {
  try {
    await ctx.answerCbQuery('Мова інтерфейсу: Українська (єдина)');
  } catch (error) {
    console.error('Error handling language:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

// Обробка callback для кнопки "Допомога"
bot.action('help', async (ctx) => {
  try {
    const helpMessage = `📋 <b>Допомога</b>

📸 <b>Як створити креатив:</b>
• Надішли фото десерту
• Обери стиль для покращення
• Отримай 2 варіанти покращеного фото

🎁 <b>Безкоштовні генерації:</b>
Перші ${config.app.freeGenerations} генерації — безкоштовно!
Після цього: ${config.payment.amount} грн за ${config.app.paidGenerationsPerPayment} генерації

💡 <b>Поради:</b>
• Фото має бути якісним та добре освітленим
• Можна вибрати один з 4 готових стилів
• Або додати свої побажання до стилю

Використовуй кнопки нижче для навігації 👇`;

    await ctx.editMessageText(helpMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Згенерувати фото десерту', callback_data: 'generate_photo' }],
          [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
          [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }],
          [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
        ],
      },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling help:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

// Обробка callback для повернення до меню
bot.action('back_to_menu', async (ctx) => {
  try {
    const user = ctx.from;
    const welcomeMessage = `🍰 Привіт, ${user.first_name || 'користувач'}!

Я **Смачно.AI** — допоможу покращити фото твоїх десертів та створити стильні креативи для Instagram! 

📸 **Як це працює:**
1. Надішли фото десерту
2. Обери стиль для покращення
3. Отримай 2 варіанти покращеного фото

🎁 **Перші ${config.app.freeGenerations} генерації — безкоштовно!**

Обери, що хочеш зробити:`;

    const menuKeyboard = {
      inline_keyboard: [
        [{ text: '📸 Згенерувати фото десерту', callback_data: 'generate_photo' }],
        [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
        [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }],
        [{ text: '❓ Допомога', callback_data: 'help' }]
      ],
    };

    // Спробуємо відредагувати повідомлення, якщо це можливо
    try {
      await ctx.editMessageText(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: menuKeyboard,
      });
    } catch (editError) {
      // Якщо не вдалося відредагувати (наприклад, це фото або інший тип повідомлення),
      // відправляємо нове повідомлення
      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: menuKeyboard,
      });
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling back to menu:', error);
    await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
  }
});

// Функція для обробки генерації
async function processGeneration(ctx, session) {
  try {
    // Перевіряємо ліміт ПЕРЕД генерацією
    const user = await db.getUserByTelegramId(ctx.from.id);
    const freeGenerationsUsed = user?.free_generations_used || 0;
    const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;
    
    // Перевіряємо, скільки оплачених генерацій доступно
    const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

    console.log(`[generation] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}, available paid: ${availablePaidGenerations}`);

    // Якщо немає безкоштовних генерацій І немає доступних оплачених - потрібна оплата
    // Перевіряємо ще раз, чи не з'явилися нові оплачені генерації (на випадок, якщо платіж щойно завершився)
    if (!canGenerateFree && availablePaidGenerations === 0) {
      // Додаткова перевірка - можливо, платіж щойно завершився і ще не оновився
      const doubleCheckPaid = await db.getAvailablePaidGenerations(ctx.from.id);
      if (doubleCheckPaid > 0) {
        console.log(`[generation] Found ${doubleCheckPaid} available paid generations on second check, proceeding with generation`);
        // Продовжуємо генерацію з оплаченими генераціями - оновлюємо змінну
        // availablePaidGenerations вже перевірена, тому просто продовжуємо
      } else {
        // Потрібна оплата - показуємо кнопку
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
            [Markup.button.url('💳 Оплатити', payment.checkoutUrl)],
            [Markup.button.callback('🏠 Головне меню', 'back_to_menu')]
          ])
        );
        return;
      } catch (paymentError) {
        console.error('[generation] Payment creation error:', paymentError);
        await ctx.reply(
          `💰 Для створення креативу потрібна оплата ${config.payment.amount} грн.\n\n` +
          `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`
        );
        return;
      }
      }
    }

    // Показуємо повідомлення про генерацію
    await ctx.reply('Працюю над твоїм смачним фото… Це займе до хвилини ⏳');

    // Аналізуємо фото
    const imageDescription = await aiService.analyzeImage(session.originalPhotoUrl);
    
    // Генеруємо зображення з урахуванням стилю
    // Передаємо originalPhotoUrl для image-to-image редагування через Gemini
    const generatedImages = await aiService.generateImage(
      imageDescription,
      session.style,
      session.customWishes,
      2, // Завжди 2 варіанти
      session.originalPhotoUrl // Передаємо оригінальне фото для Gemini
    );

    // Генеруємо підпис
    const caption = await aiService.generateCaption(imageDescription, imageDescription);

    // Зберігаємо креативи
    const userData = await db.createOrUpdateUser(ctx.from.id, {
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    });

    const savedImageUrls = [];
    for (const imageUrl of generatedImages) {
      const savedImageUrl = await storageService.saveGeneratedImage(
        imageUrl,
        `${ctx.from.id}_${Date.now()}.png`
      );
      savedImageUrls.push(savedImageUrl);

      await db.saveCreative(userData.id, {
        originalPhotoUrl: session.originalPhotoUrl,
        prompt: imageDescription,
        generatedImageUrl: savedImageUrl,
        caption,
      });
    }

    // Відправляємо результат
    await ctx.reply('Готово! Ось два варіанти твого оновленого фото 🍰✨');

    for (let i = 0; i < generatedImages.length; i++) {
      await ctx.replyWithPhoto(generatedImages[i], {
        caption: `Варіант ${i + 1}`,
      });
    }

    // Показуємо кнопки дій
    await ctx.reply(
      'Що хочеш зробити далі?',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Згенерувати ще раз (те саме фото)', callback_data: 'regenerate_same' }],
            [{ text: '✨ Змінити стиль', callback_data: 'change_style' }],
            [{ text: '🖼 Спробувати інше фото', callback_data: 'new_photo' }],
            [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
          ],
        },
      }
    );

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
      // Перевіряємо, чи є доступні оплачені генерації перед використанням
      const availableBefore = await db.getAvailablePaidGenerations(ctx.from.id);
      if (availableBefore <= 0) {
        console.error(`[generation] User ${ctx.from.id} attempted to use paid generation but has ${availableBefore} available. This should not happen!`);
        await ctx.reply(
          `❌ Помилка: немає доступних оплачених генерацій.\n\n` +
          `Будь ласка, спробуй ще раз або звернись до підтримки.`
        );
        return;
      }
      
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
        // Показуємо кнопку оплати, оскільки оплачені генерації закінчились
        try {
          const payment = await paymentService.createPayment(ctx.from.id);
          
          // Зберігаємо інформацію про платіж
          const userData = await db.createOrUpdateUser(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
          });
          await db.createPayment(userData.id, payment.amount * 100, config.payment.currency, payment.orderId);
          
          await ctx.reply(
            `💳 Використано останню оплачену генерацію.\n\n` +
            `Для наступних креативів потрібна оплата ${payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації).\n\n` +
            `Натисни кнопку нижче для оплати:`,
            Markup.inlineKeyboard([
              [Markup.button.url('💳 Оплатити', payment.checkoutUrl)],
              [Markup.button.callback('🏠 Головне меню', 'back_to_menu')]
            ])
          );
        } catch (paymentError) {
          console.error('[generation] Payment creation error:', paymentError);
          await ctx.reply(
            `💳 Використано останню оплачену генерацію.\n\n` +
            `Для наступних креативів потрібна оплата ${config.payment.amount} грн (${config.app.paidGenerationsPerPayment} генерації).\n\n` +
            `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`,
            Markup.inlineKeyboard([
              [Markup.button.callback('🏠 Головне меню', 'back_to_menu')]
            ])
          );
        }
      }
    }

    // Очищаємо сесію після успішної генерації
    userSessions.delete(ctx.from.id);

  } catch (error) {
    console.error('Error in processGeneration:', error);
    await ctx.reply('❌ Виникла помилка при генерації. Спробуй ще раз або звернись до підтримки.');
  }
}

// Обробка кнопки "📸 Згенерувати фото десерту" (через callback)
// Обробник bot.hears видалено, тепер використовується тільки callback

// Обробка кнопки "💡 Стилі / Пресети" (через callback)
// Обробник bot.hears видалено, тепер використовується тільки callback

// Обробка кнопки "ℹ️ Про бота" (через callback)
// Обробник bot.hears видалено, тепер використовується тільки callback

// Обробка кнопки "⚙️ Налаштування" (через callback)
// Обробник bot.hears видалено, тепер використовується тільки callback

// Обробка кнопки "🔙 Назад" (через callback)
// Обробник bot.hears видалено, тепер використовується тільки callback

// Обробка текстового запиту (має бути після всіх bot.hears())
bot.on('text', async (ctx) => {
  // Ігноруємо команди
  if (ctx.message.text.startsWith('/')) {
    return;
  }

  // Перевіряємо, чи це побажання для кастомного стилю
  const session = userSessions.get(ctx.from.id);
  if (session && session.style === 'custom' && !session.customWishes) {
    // Зберігаємо побажання та запускаємо генерацію
    session.customWishes = ctx.message.text;
    userSessions.set(ctx.from.id, session);
    
    await ctx.reply('Чудово! Починаю генерувати 😋\n\nЦе займе близько 1 хвилини.');
    await processGeneration(ctx, session);
    return;
  }

  // Спочатку приховуємо будь-який persistent keyboard
  try {
    const removeMsg = await ctx.telegram.sendMessage(ctx.chat.id, '', {
      reply_markup: { remove_keyboard: true },
    }).catch(() => null);
    if (removeMsg) {
      await ctx.telegram.deleteMessage(ctx.chat.id, removeMsg.message_id).catch(() => {});
    }
  } catch (e) {}

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

// Обробка помилок
bot.catch((err, ctx) => {
  console.error('Error in bot:', err);
  ctx.reply('❌ Виникла несподівана помилка. Спробуй ще раз пізніше.');
});

// Налаштування меню команд
const setupCommands = async () => {
  try {
    // Меню команд видалено - вся навігація через inline кнопки
    // /start залишається як обробник для автоматичного привітання, але не показується в меню
    await bot.telegram.setMyCommands([]);
    console.log('✅ Меню команд налаштовано');
  } catch (error) {
    console.error('⚠️ Помилка налаштування команд:', error);
  }
};

// Обробка кнопки "📸 Мої креативи" (через callback)
// Обробник bot.hears видалено, тепер використовується тільки команда /my_creatives

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
    let isOldPayment = false;
    if (paymentId) {
      // amount приходить в гривнях від WayForPay, конвертуємо в копійки для БД
      const amountInKopecks = Math.round((amount || 0) * 100);
      
      // Спочатку перевіряємо поточний статус платежу через database.js
      const existingPayment = await db.getPaymentByPaymentId(paymentId);
      wasAlreadyCompleted = existingPayment?.status === 'completed';
      
      // Перевіряємо, чи це старий платіж (створений більше ніж 10 хвилин тому)
      // Це допомагає уникнути відправки повідомлень для старих платежів, які WayForPay може надсилати повторно
      if (existingPayment?.created_at) {
        const paymentAge = Date.now() - new Date(existingPayment.created_at).getTime();
        const tenMinutes = 10 * 60 * 1000; // 10 хвилин в мілісекундах
        isOldPayment = paymentAge > tenMinutes;
        
        if (isOldPayment) {
          console.log(`[payment/webhook] Payment ${paymentId} is old (${Math.round(paymentAge / 1000 / 60)} minutes), skipping notification`);
        }
      }
      
      // Оновлюємо статус
      const updatedPayment = await db.updatePaymentStatus(paymentId, status, userId, amountInKopecks, currency);
      
      // Логуємо результат оновлення
      if (updatedPayment) {
        console.log(`[payment/webhook] Payment ${paymentId} updated successfully. Status: ${status}, User ID: ${updatedPayment.user_id}`);
      } else {
        console.error(`[payment/webhook] Failed to update payment ${paymentId}`);
      }
    }

    // Якщо платіж успішний І це перший раз (не був вже completed) І це не старий платіж, повідомляємо користувача
    if (transactionStatus === 'Approved' && !wasAlreadyCompleted && !isOldPayment) {
      const match = orderReference.match(/creative_(\d+)_/);
      if (match) {
        const telegramId = parseInt(match[1]);
        try {
          // Перевіряємо доступні оплачені генерації після успішного платежу
          const availablePaid = await db.getAvailablePaidGenerations(telegramId);
          console.log(`[payment/webhook] Payment ${orderReference} completed. User ${telegramId} now has ${availablePaid} available paid generations`);
          
          console.log(`[payment/webhook] Sending success message to user ${telegramId} for payment ${orderReference}`);
          await bot.telegram.sendMessage(
            telegramId,
            `✅ Оплата успішна! Тепер ти можеш створити новий креатив.\n\n` +
            `Доступно оплачених генерацій: ${availablePaid}\n\n` +
            `Надішли фото десерту.`
          );
        } catch (error) {
          console.error('Error sending message to user:', error);
        }
      }
    } else if (transactionStatus === 'Approved') {
      if (wasAlreadyCompleted) {
        console.log(`[payment/webhook] Payment ${orderReference} was already completed, skipping notification`);
        // Навіть якщо платіж вже був completed, перевіримо доступні генерації
        const match = orderReference.match(/creative_(\d+)_/);
        if (match) {
          const telegramId = parseInt(match[1]);
          const availablePaid = await db.getAvailablePaidGenerations(telegramId);
          console.log(`[payment/webhook] User ${telegramId} has ${availablePaid} available paid generations (payment was already completed)`);
        }
      } else if (isOldPayment) {
        console.log(`[payment/webhook] Payment ${orderReference} is old, skipping notification`);
      }
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

