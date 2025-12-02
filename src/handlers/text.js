import { getSession, setSession, deleteSession } from '../utils/sessions.js';
import { mainMenuReplyKeyboardMarkup, settingsKeyboard } from '../utils/keyboards.js';
import { processGeneration } from './generation.js';
import { db } from '../db/database.js';
import { config } from '../config.js';

/**
 * Реєстрація обробників тексту
 */
export const registerTextHandlers = (bot) => {
  // Список текстів кнопок меню, які мають бути оброблені bot.hears()
  const menuButtonTexts = [
    '✨ Створити креатив',
    '🍰 Каталог ідей / Стилі',
    '👤 Мій профіль / Баланс',
    'ℹ️ Про бота',
    '❓ Допомога',
    // Стилі
    '🍓 Яскравий та соковитий',
    '🧁 Преміум-кондитерська',
    '☕ Затишна кав\'ярня',
    '🎂 Весільна естетика',
    '🛠️ Кастомні налаштування',
    '🔙 Скасувати',
    // Локації
    '🏠 Домашня кухня',
    '☕ Кав\'ярня',
    '🍽️ Ресторан',
    '🏪 Вітрина магазину',
    '📸 Студія',
    '🌳 Природа/Вулиця',
    '🎂 Святковий стіл',
    '➖ Без локації',
    '🔙 Назад до стилів',
    // Тип контенту
    '🖼️ 2 Фото-креативи',
    '🎬 5-сек Відео',
    '🔙 Змінити стиль',
    // Анімації
    '🔄 Обертання 360°',
    '🔍 Zoom In',
    '🔎 Zoom Out',
    '↔️ Pan',
    '↕️ Tilt',
    '✨ Без анімації',
    '🔙 Назад',
    // Після генерації
    '🏠 Головне меню'
  ];

  // ВАЖЛИВО: bot.hears() має бути реєстрований ПЕРЕД bot.on('text')
  // щоб мати пріоритет обробки кнопок меню
  
  // Обробка натискань на кнопки Reply Keyboard
  bot.hears('✨ Створити креатив', async (ctx) => {
    await ctx.reply('Надішли фото десерту, який хочеш покращити 🍰✨', {
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  bot.hears('🍰 Каталог ідей / Стилі', async (ctx) => {
    await ctx.reply('🍰 <b>Каталог ідей / Стилі</b>\n\nДля перегляду каталогу надішли фото десерту та обери стиль для генерації.', {
      parse_mode: 'HTML',
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  bot.hears('👤 Мій профіль / Баланс', async (ctx) => {
    const user = await db.getUserByTelegramId(ctx.from.id);
    const availableGenerations = await db.getAvailablePaidGenerations(ctx.from.id);
    const freeGenerationsUsed = user?.free_generations_used || 0;
    const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;
    const totalAvailable = canGenerateFree ? (config.app.freeGenerations - freeGenerationsUsed) + availableGenerations : availableGenerations;
    
    await ctx.reply(
      `👤 <b>Мій профіль</b>\n\n` +
      `💰 <b>Доступно генерацій:</b> ${totalAvailable}\n` +
      `🎁 Безкоштовні: ${canGenerateFree ? config.app.freeGenerations - freeGenerationsUsed : 0}\n` +
      `💳 Оплачені: ${availableGenerations}\n\n` +
      `Для поповнення балансу надішли фото та спробуй згенерувати креатив. Якщо безкоштовні генерації закінчились, з'явиться кнопка оплати.`,
      {
        parse_mode: 'HTML',
        reply_markup: mainMenuReplyKeyboardMarkup,
      }
    );
  });

  bot.hears('ℹ️ Про бота', async (ctx) => {
    const { getAboutMessage } = await import('../utils/messages.js');
    await ctx.reply(getAboutMessage(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  bot.hears('❓ Допомога', async (ctx) => {
    const { getHelpMessage } = await import('../utils/messages.js');
    await ctx.reply(getHelpMessage(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  // Обробка вибору стилю (Reply Keyboard)
  bot.hears('🍓 Яскравий та соковитий', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.style = 'bright';
    setSession(ctx.from.id, session);
    
    const { locationSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери локацію/фон для фото 👇', {
      reply_markup: locationSelectionReplyKeyboardMarkup,
    });
  });

  bot.hears('🧁 Преміум-кондитерська', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.style = 'premium';
    setSession(ctx.from.id, session);
    
    const { locationSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери локацію/фон для фото 👇', {
      reply_markup: locationSelectionReplyKeyboardMarkup,
    });
  });

  bot.hears('☕ Затишна кав\'ярня', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.style = 'cozy';
    setSession(ctx.from.id, session);
    
    const { locationSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери локацію/фон для фото 👇', {
      reply_markup: locationSelectionReplyKeyboardMarkup,
    });
  });

  bot.hears('🎂 Весільна естетика', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.style = 'wedding';
    setSession(ctx.from.id, session);
    
    const { locationSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери локацію/фон для фото 👇', {
      reply_markup: locationSelectionReplyKeyboardMarkup,
    });
  });

  bot.hears('🛠️ Кастомні налаштування', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.style = 'custom';
    setSession(ctx.from.id, session);
    
    await ctx.reply('Опиши свої побажання до стилю (наприклад: "пастельні кольори, мінімалістичний стиль, світлий фон") 👇', {
      reply_markup: { remove_keyboard: true },
    });
  });

  bot.hears('🔙 Скасувати', async (ctx) => {
    deleteSession(ctx.from.id);
    await ctx.reply('Скасовано. Обери, що хочеш зробити:', {
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  // Обробка вибору локації (Reply Keyboard)
  const locationMap = {
    '🏠 Домашня кухня': 'home',
    '☕ Кав\'ярня': 'cafe',
    '🍽️ Ресторан': 'restaurant',
    '🏪 Вітрина магазину': 'shop',
    '📸 Студія': 'studio',
    '🌳 Природа/Вулиця': 'outdoor',
    '🎂 Святковий стіл': 'celebration',
    '➖ Без локації': 'none',
  };

  for (const [buttonText, locationValue] of Object.entries(locationMap)) {
    bot.hears(buttonText, async (ctx) => {
      const session = getSession(ctx.from.id);
      if (!session || !session.originalPhotoUrl) {
        await ctx.reply('📸 Спочатку надішли фото десерту.', {
          reply_markup: mainMenuReplyKeyboardMarkup,
        });
        return;
      }
      session.location = locationValue;
      setSession(ctx.from.id, session);
      
      const { contentTypeSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
      await ctx.reply('Обери тип контенту 👇', {
        reply_markup: contentTypeSelectionReplyKeyboardMarkup,
      });
    });
  }

  bot.hears('🔙 Назад до стилів', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (session) {
      session.location = null;
      setSession(ctx.from.id, session);
    }
    
    const { styleSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери стиль для покращеного фото 👇', {
      reply_markup: styleSelectionReplyKeyboardMarkup,
    });
  });

  // Обробка вибору типу контенту (Reply Keyboard)
  bot.hears('🖼️ 2 Фото-креативи', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.contentType = 'image';
    setSession(ctx.from.id, session);
    
    await ctx.reply('Чудово! Починаю генерувати 😋\n\nЦе займе близько 1 хвилини.', {
      reply_markup: { remove_keyboard: true },
    });
    await processGeneration(ctx, session);
  });

  bot.hears('🎬 5-сек Відео', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (!session || !session.originalPhotoUrl) {
      await ctx.reply('📸 Спочатку надішли фото десерту.', {
        reply_markup: mainMenuReplyKeyboardMarkup,
      });
      return;
    }
    session.contentType = 'kling';
    setSession(ctx.from.id, session);
    
    const { animationSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери анімацію для відео 👇', {
      reply_markup: animationSelectionReplyKeyboardMarkup,
    });
  });

  bot.hears('🔙 Змінити стиль', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (session) {
      session.contentType = null;
      session.location = null;
      setSession(ctx.from.id, session);
    }
    
    const { styleSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери стиль для покращеного фото 👇', {
      reply_markup: styleSelectionReplyKeyboardMarkup,
    });
  });

  // Обробка вибору анімації (Reply Keyboard)
  const animationMap = {
    '🔄 Обертання 360°': 'rotate',
    '🔍 Zoom In': 'zoom_in',
    '🔎 Zoom Out': 'zoom_out',
    '↔️ Pan': 'pan',
    '↕️ Tilt': 'tilt',
    '✨ Без анімації': 'none',
  };

  for (const [buttonText, animationValue] of Object.entries(animationMap)) {
    bot.hears(buttonText, async (ctx) => {
      const session = getSession(ctx.from.id);
      if (!session || !session.originalPhotoUrl) {
        await ctx.reply('📸 Спочатку надішли фото десерту.', {
          reply_markup: mainMenuReplyKeyboardMarkup,
        });
        return;
      }
      session.animation = animationValue;
      setSession(ctx.from.id, session);
      
      await ctx.reply('Чудово! Починаю генерувати відео 😋\n\nЦе займе до 5 хвилин.', {
        reply_markup: { remove_keyboard: true },
      });
      await processGeneration(ctx, session);
    });
  }

  bot.hears('🔙 Назад', async (ctx) => {
    const session = getSession(ctx.from.id);
    if (session) {
      session.animation = null;
      setSession(ctx.from.id, session);
    }
    
    const { contentTypeSelectionReplyKeyboardMarkup } = await import('../utils/keyboards.js');
    await ctx.reply('Обери тип контенту 👇', {
      reply_markup: contentTypeSelectionReplyKeyboardMarkup,
    });
  });

  // Обробка кнопки "Головне меню" після генерації
  bot.hears('🏠 Головне меню', async (ctx) => {
    deleteSession(ctx.from.id);
    await ctx.reply('Обери, що хочеш зробити:', {
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });

  // Загальний обробник тексту (реєструється після bot.hears() для менших пріоритетів)
  bot.on('text', async (ctx) => {
    // Ігноруємо команди
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    // Ігноруємо тексти кнопок меню (вони обробляються bot.hears())
    if (menuButtonTexts.includes(ctx.message.text)) {
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

        // Надсилаємо повідомлення адміну
        try {
          const userInfo = `@${ctx.from.username || 'без username'}`;
          const feedbackNotification = `📝 <b>Новий зворотний зв'язок</b>\n\n` +
            `👤 Користувач: ${userInfo} (ID: ${ctx.from.id})\n` +
            `📅 Дата: ${new Date().toLocaleString('uk-UA')}\n\n` +
            `💬 Повідомлення:\n${feedbackMessage}`;

          // Спробуємо надіслати за userId (якщо вказано)
          if (config.admin.feedbackUserId) {
            try {
              await ctx.telegram.sendMessage(config.admin.feedbackUserId, feedbackNotification, {
                parse_mode: 'HTML',
              });
              console.log(`[feedback] Notification sent to admin user ID: ${config.admin.feedbackUserId}`);
            } catch (userIdError) {
              console.error(`[feedback] Failed to send to user ID ${config.admin.feedbackUserId}:`, userIdError.message);
              // Якщо не вдалося надіслати за userId, спробуємо username
              if (config.admin.feedbackUsername) {
                await ctx.telegram.sendMessage(`@${config.admin.feedbackUsername}`, feedbackNotification, {
                  parse_mode: 'HTML',
                });
                console.log(`[feedback] Notification sent to admin username: @${config.admin.feedbackUsername}`);
              }
            }
          } else if (config.admin.feedbackUsername) {
            // Якщо вказано тільки username
            await ctx.telegram.sendMessage(`@${config.admin.feedbackUsername}`, feedbackNotification, {
              parse_mode: 'HTML',
            });
            console.log(`[feedback] Notification sent to admin username: @${config.admin.feedbackUsername}`);
          } else if (config.admin.userIds.length > 0) {
            // Якщо не вказано спеціальний username/userId, надсилаємо першому адміну
            await ctx.telegram.sendMessage(config.admin.userIds[0], feedbackNotification, {
              parse_mode: 'HTML',
            });
            console.log(`[feedback] Notification sent to first admin user ID: ${config.admin.userIds[0]}`);
          }
        } catch (notificationError) {
          console.error('[feedback] Error sending notification to admin:', notificationError);
          // Не показуємо помилку користувачу, бо повідомлення вже збережено
        }
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

    // Якщо це не побажання для стилю, просимо надіслати фото
    await ctx.reply('📸 Для генерації потрібно надіслати фото десерту.\n\nНатисни кнопку меню знизу або надішли фото напряму.', {
      reply_markup: mainMenuReplyKeyboardMarkup,
    });
  });
};

