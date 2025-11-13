import express from 'express';
import { config } from './config.js';
import { db } from './db/database.js';
import { paymentService } from './services/payment.js';
import { Telegraf } from 'telegraf';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const bot = new Telegraf(config.telegram.token);

/**
 * Обробник webhook від WayForPay після оплати
 */
app.post('/payment/webhook', async (req, res) => {
  try {
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
      ...otherData
    } = req.body;

    // Перевіряємо підпис
    const isValid = paymentService.verifyWayForPaySignature(
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
      config.payment.wayForPaySecretKey
    );

    if (!isValid) {
      console.error('Invalid WayForPay signature');
      return res.status(400).send('Invalid signature');
    }

    // Оновлюємо статус платежу в БД
    const paymentId = reasonCode || orderReference;
    const status = transactionStatus === 'Approved' ? 'completed' : 'pending';
    
    if (paymentId) {
      await db.updatePaymentStatus(paymentId, status);
    }

    // Якщо платіж успішний, повідомляємо користувача
    if (transactionStatus === 'Approved') {
      // Витягуємо telegram_id з orderReference (формат: creative_123456789_timestamp)
      const match = orderReference.match(/creative_(\d+)_/);
      if (match) {
        const telegramId = parseInt(match[1]);
        
        try {
          await bot.telegram.sendMessage(
            telegramId,
            '✅ Оплата успішна! Тепер ти можеш створити новий креатив. Надішли фото або опиши свій виріб.'
          );
        } catch (error) {
          console.error('Error sending message to user:', error);
        }
      }
    }

    // WayForPay очікує JSON відповідь
    res.status(200).json({ orderReference, status: 'accept' });
  } catch (error) {
    console.error('Error processing WayForPay webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Обробник redirect після оплати (для користувача)
 */
app.get('/payment/callback', async (req, res) => {
  try {
    const { orderReference, transactionStatus } = req.query;

    if (transactionStatus === 'Approved') {
      res.send(`
        <html>
          <head>
            <title>Оплата успішна</title>
            <meta charset="UTF-8">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>✅ Оплата успішна!</h1>
            <p>Поверніться до Telegram-бота та створіть новий креатив.</p>
            <p><a href="https://t.me/your_bot_username">Відкрити бота</a></p>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
          <head>
            <title>Помилка оплати</title>
            <meta charset="UTF-8">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Помилка оплати</h1>
            <p>Спробуйте ще раз або зверніться до підтримки.</p>
            <p><a href="https://t.me/your_bot_username">Відкрити бота</a></p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error processing payment callback:', error);
    res.status(500).send('Error');
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = config.app.port;

app.listen(PORT, () => {
  console.log(`🌐 Webhook server запущено на порту ${PORT}`);
  console.log(`📡 Payment webhook: http://your-domain.com/payment/webhook`);
  console.log(`🔗 Payment callback: http://your-domain.com/payment/callback`);
});

export default app;

