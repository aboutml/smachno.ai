import { config } from '../config.js';
import { db } from '../db/database.js';
import { aiService } from '../services/ai.js';
import { paymentService } from '../services/payment.js';
import { storageService } from '../services/storage.js';
import { Markup } from 'telegraf';
import { postGenerationKeyboard, createPaymentKeyboard } from '../utils/keyboards.js';
import { deleteSession } from '../utils/sessions.js';

/**
 * Обробка генерації зображення
 */
export async function processGeneration(ctx, session) {
  try {
    // Перевіряємо ліміт ПЕРЕД генерацією
    const user = await db.getUserByTelegramId(ctx.from.id);
    const freeGenerationsUsed = user?.free_generations_used || 0;
    const canGenerateFree = freeGenerationsUsed < config.app.freeGenerations;
    
    // Перевіряємо, скільки оплачених генерацій доступно
    const availablePaidGenerations = await db.getAvailablePaidGenerations(ctx.from.id);

    console.log(`[generation] User ${ctx.from.id}, free generations used: ${freeGenerationsUsed}/${config.app.freeGenerations}, can generate free: ${canGenerateFree}, available paid: ${availablePaidGenerations}`);

    // Якщо немає безкоштовних генерацій І немає доступних оплачених - потрібна оплата
    if (!canGenerateFree && availablePaidGenerations === 0) {
      // Додаткова перевірка - можливо, платіж щойно завершився і ще не оновився
      const doubleCheckPaid = await db.getAvailablePaidGenerations(ctx.from.id);
      if (doubleCheckPaid > 0) {
        console.log(`[generation] Found ${doubleCheckPaid} available paid generations on second check, proceeding with generation`);
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
            createPaymentKeyboard(payment.checkoutUrl)
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
    const generatedImages = await aiService.generateImage(
      imageDescription,
      session.style,
      session.customWishes,
      2, // Завжди 2 варіанти
      session.originalPhotoUrl
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

    // Використовуємо збережені URL з Supabase Storage
    for (let i = 0; i < savedImageUrls.length; i++) {
      await ctx.replyWithPhoto(savedImageUrls[i], {
        caption: `Варіант ${i + 1}`,
      });
    }

    // Показуємо кнопки дій
    await ctx.reply('Що хочеш зробити далі?', {
      reply_markup: postGenerationKeyboard,
    });

    // Визначаємо, чи це безкоштовна чи оплачена генерація
    const isFreeGeneration = canGenerateFree;
    
    if (isFreeGeneration) {
      // Оновлюємо лічильник безкоштовних генерацій
      await db.incrementFreeGenerations(ctx.from.id);
      
      const remainingFree = config.app.freeGenerations - ((user?.free_generations_used || 0) + 1);
      if (remainingFree > 0) {
        await ctx.reply(`🎁 Залишилось безкоштовних генерацій: ${remainingFree}`);
      } else {
        await ctx.reply(
          `💳 Безкоштовні генерації вичерпано.\n\n` +
          `Наступні креативи коштуватимуть ${config.payment.amount} грн за 1 генерацію (2 варіанти зображень).`
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
            `Для наступних креативів потрібна оплата ${payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `Натисни кнопку нижче для оплати:`,
            createPaymentKeyboard(payment.checkoutUrl)
          );
        } catch (paymentError) {
          console.error('[generation] Payment creation error:', paymentError);
          await ctx.reply(
            `💳 Використано останню оплачену генерацію.\n\n` +
            `Для наступних креативів потрібна оплата ${config.payment.amount} грн за 1 генерацію (2 варіанти зображень).\n\n` +
            `⚠️ Помилка створення платежу. Спробуй ще раз або звернись до підтримки.`,
            Markup.inlineKeyboard([
              [Markup.button.callback('🏠 Головне меню', 'back_to_menu')]
            ])
          );
        }
      }
    }

    // Очищаємо сесію після успішної генерації
    deleteSession(ctx.from.id);

  } catch (error) {
    console.error('Error in processGeneration:', error);
    await ctx.reply('❌ Виникла помилка при генерації. Спробуй ще раз або звернись до підтримки.');
  }
}

