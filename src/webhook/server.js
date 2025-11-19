import express from 'express';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { paymentService } from '../services/payment.js';

/**
 * Створює та налаштовує webhook сервер
 */
export const createWebhookServer = (bot) => {
  const webhookApp = express();

  // Парсимо body
  webhookApp.use(express.json());
  webhookApp.use(express.urlencoded({ extended: true }));

  // Middleware для логування
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
      // Парсимо WayForPay body формат
      let bodyData = {};
      if (req.body && typeof req.body === 'object') {
        const bodyKeys = Object.keys(req.body);
        if (bodyKeys.length > 0) {
          try {
            const mainDataKey = bodyKeys[0];
            let productsJson = '';
            if (req.body[mainDataKey] && typeof req.body[mainDataKey] === 'object') {
              const nestedKeys = Object.keys(req.body[mainDataKey]);
              if (nestedKeys.length > 0) {
                productsJson = nestedKeys[0];
              }
            }
            
            let fullJsonString = mainDataKey.trim();
            if (productsJson) {
              if (fullJsonString.endsWith('"products":')) {
                fullJsonString = fullJsonString.slice(0, -1) + ':[';
              } else if (fullJsonString.endsWith('"products": ')) {
                fullJsonString = fullJsonString.slice(0, -2) + ':[';
              } else if (fullJsonString.endsWith(':')) {
                fullJsonString = fullJsonString.slice(0, -1) + ':[';
              }
              fullJsonString += productsJson + ']}';
            } else {
              if (fullJsonString.endsWith('"products":')) {
                fullJsonString = fullJsonString.slice(0, -1) + '[]}';
              } else if (fullJsonString.endsWith(':')) {
                fullJsonString = fullJsonString.slice(0, -1) + '[]}';
              } else if (!fullJsonString.endsWith('}')) {
                fullJsonString += '}';
              }
            }
            
            bodyData = JSON.parse(fullJsonString);
          } catch (error) {
            console.error('[payment/webhook] Error parsing WayForPay body format:', error);
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

      if (!merchantAccount || !orderReference || !merchantSignature) {
        console.error('[payment/webhook] Missing required fields');
        return res.status(400).send('Missing required fields');
      }
      
      // Перевіряємо підпис
      const secretKeyToUse = config.payment.wayForPayMerchantPassword || config.payment.wayForPaySecretKey;
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
      
      if (!isValid && config.payment.wayForPaySecretKey && config.payment.wayForPayMerchantPassword) {
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

      // Визначаємо статус
      let status = 'pending';
      if (transactionStatus === 'Approved') {
        status = 'completed';
      } else if (transactionStatus === 'Refunded') {
        status = 'refunded';
      } else if (transactionStatus === 'Declined' || transactionStatus === 'Expired') {
        status = 'failed';
      }
      
      const paymentId = orderReference;
      const match = orderReference.match(/creative_(\d+)_/);
      const userId = match ? parseInt(match[1]) : null;
      
      // Перевіряємо поточний статус
      let wasAlreadyCompleted = false;
      let isOldPayment = false;
      if (paymentId) {
        const amountInKopecks = Math.round((amount || 0) * 100);
        const existingPayment = await db.getPaymentByPaymentId(paymentId);
        wasAlreadyCompleted = existingPayment?.status === 'completed';
        
        if (existingPayment?.created_at) {
          const paymentAge = Date.now() - new Date(existingPayment.created_at).getTime();
          const tenMinutes = 10 * 60 * 1000;
          isOldPayment = paymentAge > tenMinutes;
        }
        
        await db.updatePaymentStatus(paymentId, status, userId, amountInKopecks, currency);
      }

      // Повідомляємо користувача про успішний платіж
      if (transactionStatus === 'Approved' && !wasAlreadyCompleted && !isOldPayment) {
        const match = orderReference.match(/creative_(\d+)_/);
        if (match) {
          const telegramId = parseInt(match[1]);
          try {
            const availablePaid = await db.getAvailablePaidGenerations(telegramId);
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
      }

      res.status(200).json({ orderReference, status: 'accept' });
    } catch (error) {
      console.error('Error processing WayForPay webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Callback endpoint
  const handlePaymentCallback = async (req, res) => {
    try {
      let orderReference = req.query.orderReference || req.body?.orderReference;
      let transactionStatus = req.query.transactionStatus || req.body?.transactionStatus;
      
      if (!orderReference && req.url) {
        const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
        orderReference = orderReference || urlParams.get('orderReference');
        transactionStatus = transactionStatus || urlParams.get('transactionStatus');
      }
      
      if (!transactionStatus && orderReference) {
        const payment = await db.getPaymentByPaymentId(orderReference);
        if (payment) {
          transactionStatus = payment.status === 'completed' ? 'Approved' : 
            (payment.status === 'refunded' ? 'Refunded' : 'Declined');
        } else {
          transactionStatus = 'Approved';
        }
      }
      
      if (!transactionStatus && !orderReference) {
        transactionStatus = 'Approved';
      }
      
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
      console.error('[payment/callback] Error:', error);
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

  webhookApp.get('/payment/callback', handlePaymentCallback);
  webhookApp.post('/payment/callback', handlePaymentCallback);

  // Health check
  webhookApp.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'Смачно.AI Webhook Server',
      uptime: process.uptime()
    });
  });

  webhookApp.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  // Payment form
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  webhookApp.get('/payment/form/:orderReference', async (req, res) => {
    try {
      const { orderReference } = req.params;
      if (!orderReference) {
        return res.status(400).send('Missing orderReference');
      }
      
      if (!config.payment.wayForPayMerchantAccount || !config.payment.wayForPaySecretKey) {
        return res.status(500).send('Payment service not configured');
      }
      
      const orderDate = parseInt(req.query.orderDate) || Math.floor(Date.now() / 1000);
      const amount = parseInt(req.query.amount) || config.payment.amount * 100;
      
      const paymentData = {
        merchantAccount: req.query.merchantAccount || config.payment.wayForPayMerchantAccount,
        merchantDomainName: req.query.merchantDomainName || config.payment.merchantDomainName,
        orderReference: orderReference,
        orderDate: orderDate,
        amount: amount,
        currency: req.query.currency || config.payment.currency,
        productName: [req.query.productName || process.env.WAYFORPAY_PRODUCT_NAME || 'Generation of creative for Instagram'],
        productCount: [1],
        productPrice: [amount],
        returnUrl: req.query.returnUrl || `${process.env.APP_URL || 'https://your-app.com'}/payment/callback`,
        serviceUrl: req.query.serviceUrl || `${process.env.APP_URL || 'https://your-app.com'}/payment/webhook`,
      };
      
      const secretKeyToUse = config.payment.wayForPayMerchantPassword || config.payment.wayForPaySecretKey;
      const signature = paymentService.createWayForPaySignature(paymentData, secretKeyToUse, true);
      paymentData.merchantSignature = signature;
      
      const html = `<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Перенаправлення на оплату...</title>
    <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
        .loader { text-align: center; }
        .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
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
    <script>document.getElementById('wayforpayForm').submit();</script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error('[payment/form] Error:', error);
      res.status(500).send(`<html><head><title>Помилка</title><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;"><h1>Помилка створення форми оплати</h1><p>${escapeHtml(error.message)}</p></body></html>`);
    }
  });

  // Root endpoint
  webhookApp.get('/', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      service: 'Смачно.AI Bot & Webhook Server',
      timestamp: new Date().toISOString() 
    });
  });

  return webhookApp;
};

/**
 * Запускає webhook сервер
 */
export const startWebhookServer = (webhookApp) => {
  const PORT = config.app.port || process.env.PORT || 3000;
  
  console.log('🌐 Запуск webhook сервера...');
  console.log(`[Webhook] Використовується порт: ${PORT}`);
  console.log(`[Webhook] APP_URL: ${process.env.APP_URL || 'не встановлено'}`);

  const server = webhookApp.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Webhook server запущено на порту ${PORT}`);
    console.log(`📡 Payment webhook: ${process.env.APP_URL || 'https://your-domain.com'}/payment/webhook`);
    console.log(`🔗 Payment callback: ${process.env.APP_URL || 'https://your-domain.com'}/payment/callback`);
    console.log(`🏥 Health check: ${process.env.APP_URL || 'https://your-domain.com'}/health`);
  });

  server.on('error', (error) => {
    console.error('❌ Помилка webhook сервера:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Порт ${PORT} вже використовується!`);
    }
  });

  return server;
};

