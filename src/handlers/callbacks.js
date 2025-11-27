import { Markup } from 'telegraf';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { paymentService } from '../services/payment.js';
import { getSession, setSession, deleteSession, getOrCreateSessionWithLastPhoto } from '../utils/sessions.js';
import { 
  mainMenuKeyboard, 
  styleSelectionKeyboard,
  locationSelectionKeyboard,
  contentTypeSelectionKeyboard,
  animationSelectionKeyboard,
  stylesMenuKeyboard, 
  categoryKeyboard,
  settingsKeyboard,
  creativeKeyboard,
  backKeyboard,
  createPaymentKeyboard
} from '../utils/keyboards.js';
import { getWelcomeMessage, getAboutMessage, getHelpMessage, getSettingsMessage } from '../utils/messages.js';
import { processGeneration } from './generation.js';

/**
 * Реєстрація всіх callback обробників
 */
export const registerCallbacks = (bot) => {
  // Обробка вибору стилю
  bot.action(/^style_(bright|premium|cozy|wedding|custom)$/, async (ctx) => {
    try {
      const style = ctx.match[1];
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Оновлюємо стиль в сесії
      session.style = style;
      setSession(ctx.from.id, session);

      if (style === 'custom') {
        await ctx.editMessageText('Напиши додаткові побажання до стилю — що підкреслити, змінити чи додати.');
        await ctx.answerCbQuery();
      } else {
        // Показуємо вибір локації
        await ctx.editMessageText('Обери локацію/фон для фото 👇', {
          reply_markup: locationSelectionKeyboard,
        });
        await ctx.answerCbQuery();
      }
    } catch (error) {
      console.error('Error handling style selection:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Обробка вибору локації
  bot.action(/^location_(home|cafe|restaurant|shop|studio|outdoor|celebration|none)$/, async (ctx) => {
    try {
      const location = ctx.match[1];
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Оновлюємо локацію в сесії
      session.location = location;
      setSession(ctx.from.id, session);

      // Показуємо вибір типу контенту (фото/відео)
      await ctx.editMessageText('Обери тип контенту 👇', {
        reply_markup: contentTypeSelectionKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling location selection:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Обробка вибору типу контенту
  // За замовчуванням використовуємо KlingAI для відео (Veo залишається в коді для майбутнього використання)
  bot.action(/^content_(photo|video|kling)$/, async (ctx) => {
    try {
      const contentType = ctx.match[1];
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Оновлюємо тип контенту в сесії
      // За замовчуванням використовуємо KlingAI для відео (content_video теж використовує KlingAI)
      session.contentType = (contentType === 'video' || contentType === 'kling') ? 'kling' : contentType;
      setSession(ctx.from.id, session);

      // Якщо це фото - одразу генеруємо
      if (contentType === 'photo') {
        await ctx.editMessageText('Чудово! Починаю генерувати 😋\n\nЦе займе близько 1 хвилини.');
        // Відповідаємо на callback query одразу, щоб уникнути таймауту Telegram (90 секунд)
        await ctx.answerCbQuery('⏳ Генерую фото... Це займе до хвилини ⏳');
        
        // Запускаємо генерацію асинхронно (не чекаємо завершення)
        processGeneration(ctx, session).catch((error) => {
          console.error('[callbacks] Error in processGeneration:', error);
          ctx.reply(`❌ Помилка генерації: ${error.message || 'Невідома помилка'}`).catch(console.error);
        });
      } else {
        // Для відео - показуємо вибір анімації
        await ctx.editMessageText('Обери тип анімації для відео 🎬\n\nЯка анімація тобі подобається?', {
          reply_markup: animationSelectionKeyboard,
        });
        await ctx.answerCbQuery();
      }
    } catch (error) {
      console.error('Error handling content type selection:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Обробка вибору анімації
  bot.action(/^animation_(rotate|zoom_in|zoom_out|pan|tilt|none)$/, async (ctx) => {
    try {
      const animationType = ctx.match[1];
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Зберігаємо вибір анімації в сесії
      session.animation = animationType;
      setSession(ctx.from.id, session);

      const animationNames = {
        rotate: 'обертання 360°',
        zoom_in: 'наближення',
        zoom_out: 'віддалення',
        pan: 'рух вліво-вправо',
        tilt: 'рух вгору-вниз',
        none: 'без анімації'
      };

      const contentType = session.contentType === 'kling' ? 'KlingAI 1.6' : 'Veo 3.1';
      await ctx.editMessageText(`Чудово! Обрано анімацію: ${animationNames[animationType]} 🎬\n\nПочинаю генерувати відео через ${contentType}...\n\nЦе займе 2-5 хвилин ⏳`);
      // Відповідаємо на callback query одразу, щоб уникнути таймауту Telegram (90 секунд)
      await ctx.answerCbQuery('⏳ Генерую відео... Це може зайняти до 50 хвилин ⏳');
      
      // Запускаємо генерацію асинхронно (не чекаємо завершення)
      processGeneration(ctx, session).catch((error) => {
        console.error('[callbacks] Error in processGeneration:', error);
        ctx.reply(`❌ Помилка генерації: ${error.message || 'Невідома помилка'}`).catch(console.error);
      });
    } catch (error) {
      console.error('Error handling animation selection:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Обробка повернення до вибору типу контенту
  bot.action('back_to_content_type', async (ctx) => {
    try {
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Видаляємо вибір анімації та типу контенту
      delete session.animation;
      delete session.contentType;
      setSession(ctx.from.id, session);

      await ctx.editMessageText('Обери тип контенту 👇', {
        reply_markup: contentTypeSelectionKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling back to content type:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Обробка повернення до вибору локації
  bot.action('back_to_location', async (ctx) => {
    try {
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Очищаємо тип контенту
      delete session.contentType;
      setSession(ctx.from.id, session);

      await ctx.editMessageText('Обери локацію/фон для фото 👇', {
        reply_markup: locationSelectionKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling back to location:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Обробка повернення до вибору стилю
  bot.action('back_to_styles', async (ctx) => {
    try {
      const session = getSession(ctx.from.id);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }

      // Очищаємо локацію, якщо була вибрана
      delete session.location;
      setSession(ctx.from.id, session);

      await ctx.editMessageText('Обери стиль для покращеного фото 👇', {
        reply_markup: styleSelectionKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling back to styles:', error);
      await ctx.answerCbQuery('Помилка при обробці. Спробуй ще раз.');
    }
  });

  // Регенерація з тим самим фото
  bot.action('regenerate_same', async (ctx) => {
    try {
      // Перевіряємо доступні генерації перед показом вибору стилю
      const user = await db.getUserByTelegramId(ctx.from.id);
      const freeGenerationsUsed = user?.free_generations_used || 0;
      const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;
      const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

      // Якщо немає доступних генерацій - показуємо оплату
      if (!canGenerateFree && availablePaidGenerations === 0) {
        try {
          const payment = await paymentService.createPayment(ctx.from.id);
          const userData = await db.createOrUpdateUser(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
          });
          await db.createPayment(userData.id, payment.amount * 100, config.payment.currency, payment.orderId);
          
          await ctx.editMessageText(
            `💰 Для створення креативу потрібна оплата ${payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `Натисни кнопку нижче для оплати:`,
            createPaymentKeyboard(payment.checkoutUrl)
          );
          await ctx.answerCbQuery();
          return;
        } catch (paymentError) {
          console.error('[regenerate_same] Payment creation error:', paymentError);
          await ctx.editMessageText(
            `💰 Для створення креативу потрібна оплата ${config.payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`,
            { reply_markup: backKeyboard }
          );
          await ctx.answerCbQuery();
          return;
        }
      }

      let session = await getOrCreateSessionWithLastPhoto(ctx.from.id, db);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }
      
      // Очищаємо попередні вибори
      session.style = null;
      session.location = null;
      session.customWishes = null;
      setSession(ctx.from.id, session);
      
      await ctx.editMessageText('Обери стиль для покращеного фото 👇', {
        reply_markup: styleSelectionKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling regenerate:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Зміна стилю
  bot.action('change_style', async (ctx) => {
    try {
      // Перевіряємо доступні генерації перед показом вибору стилю
      const user = await db.getUserByTelegramId(ctx.from.id);
      const freeGenerationsUsed = user?.free_generations_used || 0;
      const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;
      const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

      // Якщо немає доступних генерацій - показуємо оплату
      if (!canGenerateFree && availablePaidGenerations === 0) {
        try {
          const payment = await paymentService.createPayment(ctx.from.id);
          const userData = await db.createOrUpdateUser(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
          });
          await db.createPayment(userData.id, payment.amount * 100, config.payment.currency, payment.orderId);
          
          await ctx.editMessageText(
            `💰 Для створення креативу потрібна оплата ${payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `Натисни кнопку нижче для оплати:`,
            createPaymentKeyboard(payment.checkoutUrl)
          );
          await ctx.answerCbQuery();
          return;
        } catch (paymentError) {
          console.error('[change_style] Payment creation error:', paymentError);
          await ctx.editMessageText(
            `💰 Для створення креативу потрібна оплата ${config.payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`,
            { reply_markup: backKeyboard }
          );
          await ctx.answerCbQuery();
          return;
        }
      }

      let session = await getOrCreateSessionWithLastPhoto(ctx.from.id, db);
      
      if (!session || !session.originalPhotoUrl) {
        await ctx.answerCbQuery('Помилка: фото не знайдено. Надішли фото спочатку.');
        return;
      }
      
      // Скидаємо стиль, локацію та показуємо вибір знову
      session.style = null;
      session.location = null;
      session.customWishes = null;
      setSession(ctx.from.id, session);
      
      await ctx.editMessageText('Обери стиль для покращеного фото 👇', {
        reply_markup: styleSelectionKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling change style:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Нове фото
  bot.action('new_photo', async (ctx) => {
    try {
      deleteSession(ctx.from.id);
      await ctx.editMessageText('Надішли нове фото десерту, який хочеш покращити 🍰✨');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling new photo:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Категорії стилів/пресетів
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
        { reply_markup: categoryKeyboard }
      );
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling style category:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Генерація власного фото
  bot.action('generate_own', async (ctx) => {
    try {
      await ctx.editMessageText('Надішли фото десерту, який хочеш покращити 🍰✨');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling generate own:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Генерація фото (перевірка оплати)
  bot.action('generate_photo', async (ctx) => {
    try {
      const user = await db.getUserByTelegramId(ctx.from.id);
      const freeGenerationsUsed = user?.free_generations_used || 0;
      const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;
      const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

      console.log(`[generate_photo] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}, available paid: ${availablePaidGenerations}`);

      if (!canGenerateFree && availablePaidGenerations === 0) {
        try {
          const payment = await paymentService.createPayment(ctx.from.id);
          const userData = await db.createOrUpdateUser(ctx.from.id, {
            username: ctx.from.username,
            first_name: ctx.from.first_name,
          });
          await db.createPayment(userData.id, payment.amount * 100, config.payment.currency, payment.orderId);
          
          await ctx.editMessageText(
            `💰 Для створення креативу потрібна оплата ${payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `Натисни кнопку нижче для оплати:`,
            createPaymentKeyboard(payment.checkoutUrl)
          );
          await ctx.answerCbQuery();
          return;
        } catch (paymentError) {
          console.error('[generate_photo] Payment creation error:', paymentError);
          await ctx.editMessageText(
            `💰 Для створення креативу потрібна оплата ${config.payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`,
            { reply_markup: backKeyboard }
          );
          await ctx.answerCbQuery();
          return;
        }
      }

      await ctx.editMessageText('Надішли фото десерту, який хочеш покращити 🍰✨', {
        reply_markup: backKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling generate photo:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Меню стилів/пресетів
  bot.action('styles_menu', async (ctx) => {
    try {
      await ctx.editMessageText('Обери категорію для натхнення 👇', {
        reply_markup: stylesMenuKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling styles menu:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Про бота
  bot.action('about', async (ctx) => {
    try {
      await ctx.editMessageText(getAboutMessage(), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]],
        },
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling about:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Налаштування
  bot.action('feedback', async (ctx) => {
    try {
      await ctx.editMessageText('📝 Надішли своє повідомлення, пропозицію або повідом про помилку.\n\nТвоя думка дуже важлива для нас! 💙', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'settings' }]
          ],
        },
      });
      await ctx.answerCbQuery();
      
      // Встановлюємо флаг, що очікуємо зворотний зв'язок
      const session = getSession(ctx.from.id) || {};
      session.waitingForFeedback = true;
      setSession(ctx.from.id, session);
    } catch (error) {
      console.error('[feedback] Error:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  bot.action('settings', async (ctx) => {
    try {
      await ctx.editMessageText(getSettingsMessage(), {
        parse_mode: 'HTML',
        reply_markup: settingsKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling settings:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Мої креативи
  bot.action('my_creatives', async (ctx) => {
    try {
      const creatives = await db.getUserCreatives(ctx.from.id, 5);
      console.log(`[my_creatives] User ${ctx.from.id}, found ${creatives.length} creatives`);

      if (creatives.length === 0) {
        await ctx.editMessageText('📭 У тебе ще немає створених креативів.\n\nНадішли фото десерту, щоб створити перший креатив!', {
          reply_markup: mainMenuKeyboard,
        });
        await ctx.answerCbQuery();
        return;
      }

      await ctx.editMessageText(`📸 Твої останні креативи (${creatives.length}):`, {
        reply_markup: mainMenuKeyboard,
      });
      await ctx.answerCbQuery();

      // Відправляємо креативи
      for (let i = 0; i < creatives.length; i++) {
        const creative = creatives[i];
        const isLast = i === creatives.length - 1;
        const contentType = creative.content_type || 'image';
        
        try {
          const caption = creative.caption 
            ? `${creative.caption}\n\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`
            : `📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`;
          
          if (contentType === 'video' && creative.generated_video_url) {
            // Відправляємо відео
            await ctx.replyWithVideo(creative.generated_video_url, {
              caption: caption.substring(0, 1024),
              reply_markup: isLast ? creativeKeyboard : undefined,
            });
          } else if (creative.generated_image_url) {
            // Відправляємо фото
            await ctx.replyWithPhoto(creative.generated_image_url, {
              caption: caption.substring(0, 1024),
              reply_markup: isLast ? creativeKeyboard : undefined,
            });
          } else {
            await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}`, {
              reply_markup: isLast ? creativeKeyboard : undefined,
            });
          }
        } catch (error) {
          console.error(`[my_creatives] Error sending creative ${creative.id}:`, error);
          try {
            await ctx.reply(`📄 Креатив #${creative.id}\n${creative.caption || 'Без опису'}\n📅 ${new Date(creative.created_at).toLocaleDateString('uk-UA')}\n\n⚠️ Не вдалося завантажити ${contentType === 'video' ? 'відео' : 'зображення'}`, {
              reply_markup: isLast ? creativeKeyboard : undefined,
            });
          } catch (e) {
            console.error(`[my_creatives] Failed to send fallback message:`, e);
          }
        }
      }
    } catch (error) {
      console.error('[my_creatives] Error:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Мова
  bot.action('language', async (ctx) => {
    try {
      await ctx.answerCbQuery('Мова інтерфейсу: Українська (єдина)');
    } catch (error) {
      console.error('Error handling language:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Допомога
  bot.action('help', async (ctx) => {
    try {
      await ctx.editMessageText(getHelpMessage(), {
        parse_mode: 'HTML',
        reply_markup: mainMenuKeyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling help:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });

  // Повернення до меню
  bot.action('back_to_menu', async (ctx) => {
    try {
      const user = ctx.from;
      const welcomeMessage = getWelcomeMessage(user.first_name);

      try {
        await ctx.editMessageText(welcomeMessage, {
          parse_mode: 'Markdown',
          reply_markup: mainMenuKeyboard,
        });
      } catch (editError) {
        await ctx.reply(welcomeMessage, {
          parse_mode: 'Markdown',
          reply_markup: mainMenuKeyboard,
        });
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Error handling back to menu:', error);
      await ctx.answerCbQuery('Помилка. Спробуй ще раз.');
    }
  });
};

