import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config.js';

export class PaymentService {
  /**
   * Створює платіжну сесію WayForPay
   * @param {number} userId - ID користувача
   * @param {number} amount - Сума в копійках
   * @returns {Object} Дані для оплати
   */
  async createPayment(userId, amount = null) {
    const paymentAmountInHryvnias = amount || config.payment.amount;
    
    const orderReference = `creative_${userId}_${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);
    
    const requestData = {
      merchantAccount: config.payment.wayForPayMerchantAccount,
      merchantDomainName: config.payment.merchantDomainName,
      orderReference: orderReference,
      orderDate: orderDate,
      amount: paymentAmountInHryvnias, // В гривнях для Create Invoice API
      currency: config.payment.currency,
      // Використовуємо латиницю для тестування (кирилиця може викликати проблеми з підписом)
      productName: [process.env.WAYFORPAY_PRODUCT_NAME || 'Generation of creative for Instagram/TikTok'],
      productCount: [1], // Кількість товарів (завжди 1)
      productPrice: [paymentAmountInHryvnias], // Ціна в гривнях для Create Invoice API
      returnUrl: `${process.env.APP_URL || 'https://your-app.com'}/payment/callback`,
      serviceUrl: `${process.env.APP_URL || 'https://your-app.com'}/payment/webhook`,
    };
    
    // Перевірка налаштувань
    if (config.payment.merchantDomainName && config.payment.merchantDomainName.includes('t_me_')) {
      console.error('[WayForPay] ⚠️ ПОМИЛКА: MERCHANT_DOMAIN_NAME вказано як merchant account!');
      console.error('[WayForPay] MERCHANT_DOMAIN_NAME має бути доменом');
    }
    
    // Перевірка, чи productCount правильний
    if (requestData.productCount[0] !== 1) {
      requestData.productCount = [1];
    }

    // Перевіряємо наявність обов'язкових полів
    if (!config.payment.wayForPayMerchantAccount) {
      throw new Error('WAYFORPAY_MERCHANT_ACCOUNT не налаштовано');
    }
    if (!config.payment.wayForPaySecretKey && !config.payment.wayForPayMerchantPassword) {
      throw new Error('WAYFORPAY_SECRET_KEY або WAYFORPAY_MERCHANT_PASSWORD не налаштовано');
    }

    // Створюємо підпис для WayForPay
    // Спочатку спробуємо SECRET KEY (40 символів), якщо є, інакше MERCHANT PASSWORD (32 символи)
    let secretKeyToUse = config.payment.wayForPaySecretKey || config.payment.wayForPayMerchantPassword;
    
    if (config.payment.wayForPaySecretKey && config.payment.wayForPaySecretKey.length === 40) {
      secretKeyToUse = config.payment.wayForPaySecretKey;
    } else if (config.payment.wayForPayMerchantPassword) {
      secretKeyToUse = config.payment.wayForPayMerchantPassword;
    }
    
    const signature = this.createWayForPaySignature(requestData, secretKeyToUse, false);
    requestData.merchantSignature = signature;
    
    // Альтернативний варіант: використовуємо widget замість API
    // Якщо API не працює, можна використати цей метод
    const useWidget = process.env.WAYFORPAY_USE_WIDGET === 'true';
    
    if (useWidget) {
      return this.createPaymentViaWidget(requestData, orderReference, paymentAmountInKopecks);
    }

    try {
      // Викликаємо WayForPay API для створення інвойсу
      // WayForPay вимагає apiVersion в запиті
      // Переконуємося, що productCount правильний перед відправкою
      const requestPayload = {
        transactionType: 'CREATE_INVOICE',
        apiVersion: 1,
        ...requestData,
        productCount: [1], // ВАЖЛИВО: завжди [1], не amount!
      };

      console.log('[WayForPay] Request payload:', JSON.stringify(requestPayload, null, 2));
      console.log('[WayForPay] Payload validation - productCount:', requestPayload.productCount, 'має бути [1]');
      console.log('[WayForPay] API endpoint: https://api.wayforpay.com/api');

      const response = await axios.post(
        'https://api.wayforpay.com/api',
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 секунд таймаут
        }
      );


      // WayForPay повертає дані в response.data
      if (response.data) {
        // Перевіряємо різні можливі формати відповіді
        if (response.data.invoiceUrl) {
          return {
            orderId: orderReference,
            checkoutUrl: response.data.invoiceUrl,
            amount: paymentAmountInHryvnias,
          };
        } else if (response.data.url) {
          return {
            orderId: orderReference,
            checkoutUrl: response.data.url,
            amount: paymentAmountInHryvnias,
          };
        } else if (response.data.errorCode) {
          throw new Error(`WayForPay помилка: ${response.data.reason || response.data.errorMessage || 'Невідома помилка'}`);
        } else if (response.data.reasonCode === 1113) {
          // Invalid signature - спробуємо використати інший ключ або widget
                
                // Спробуємо використати інший ключ, якщо є обидва
                if (config.payment.wayForPaySecretKey && config.payment.wayForPayMerchantPassword) {
                  // Якщо використовували SECRET KEY, спробуємо MERCHANT PASSWORD
                  if (secretKeyToUse === config.payment.wayForPaySecretKey) {
                    const alternativeKey = config.payment.wayForPayMerchantPassword;
                    const alternativeSignature = this.createWayForPaySignature(requestData, alternativeKey, false);
                    requestData.merchantSignature = alternativeSignature;
                    
                    // Повторний запит з альтернативним ключем
                    const retryPayload = {
                      ...requestPayload,
                      merchantSignature: alternativeSignature,
                    };
                    
                    try {
                      const retryResponse = await axios.post(
                        'https://api.wayforpay.com/api',
                        retryPayload,
                        {
                          headers: { 'Content-Type': 'application/json' },
                          timeout: 10000,
                        }
                      );
                      
                      if (retryResponse.data && (retryResponse.data.invoiceUrl || retryResponse.data.url)) {
                        return {
                          orderId: orderReference,
                          checkoutUrl: retryResponse.data.invoiceUrl || retryResponse.data.url,
                          amount: paymentAmountInHryvnias,
                        };
                      }
                    } catch (retryError) {
                      // Ігноруємо помилку retry
                    }
                  } else {
                    // Якщо використовували MERCHANT PASSWORD, спробуємо SECRET KEY
                    const alternativeKey = config.payment.wayForPaySecretKey;
                    const alternativeSignature = this.createWayForPaySignature(requestData, alternativeKey, false);
                    requestData.merchantSignature = alternativeSignature;
                    
                    // Повторний запит з альтернативним ключем
                    const retryPayload = {
                      ...requestPayload,
                      merchantSignature: alternativeSignature,
                    };
                    
                    try {
                      const retryResponse = await axios.post(
                        'https://api.wayforpay.com/api',
                        retryPayload,
                        {
                          headers: { 'Content-Type': 'application/json' },
                          timeout: 10000,
                        }
                      );
                      
                      if (retryResponse.data && (retryResponse.data.invoiceUrl || retryResponse.data.url)) {
                        console.log('[WayForPay] ✅ Success with alternative key (SECRET KEY)');
                        return {
                          orderId: orderReference,
                          checkoutUrl: retryResponse.data.invoiceUrl || retryResponse.data.url,
                          amount: paymentAmountInHryvnias,
                        };
                      }
                    } catch (retryError) {
                      // Ігноруємо помилку retry
                    }
                  }
                  
                  // Спробуємо також HMAC-MD5, якщо використовували простий MD5
                  const hmacSignature = this.createWayForPaySignature(requestData, secretKeyToUse, false, true);
                  requestData.merchantSignature = hmacSignature;
                  
                  const hmacPayload = {
                    ...requestPayload,
                    merchantSignature: hmacSignature,
                  };
                  
                  try {
                    const hmacResponse = await axios.post(
                      'https://api.wayforpay.com/api',
                      hmacPayload,
                      {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000,
                      }
                    );
                    
                    if (hmacResponse.data && (hmacResponse.data.invoiceUrl || hmacResponse.data.url)) {
                      return {
                        orderId: orderReference,
                        checkoutUrl: hmacResponse.data.invoiceUrl || hmacResponse.data.url,
                        amount: paymentAmountInHryvnias,
                      };
                    }
                    } catch (hmacError) {
                      // Ігноруємо помилку retry
                    }
                  }
                  
                  // Якщо всі спроби не вдалися, спробуємо widget
                  return this.createPaymentViaWidget(requestData, orderReference, paymentAmountInKopecks);
              } else {
                // Якщо це помилка підпису, спробуємо widget
                if (response.data.reasonCode === 1113) {
                  return this.createPaymentViaWidget(requestData, orderReference, paymentAmountInKopecks);
                }
                throw new Error(`WayForPay повернув неочікуваний формат відповіді: ${JSON.stringify(response.data)}`);
              }
      }
      
      throw new Error('Invalid response from WayForPay - response.data is empty');
    } catch (error) {
      if (error.response) {
        // Якщо отримали HTML, це означає неправильний endpoint
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
          throw new Error('Неправильна конфігурація WayForPay API endpoint. Перевірте документацію WayForPay.');
        }
        
        // Якщо отримали помилку від API
        if (error.response.data && typeof error.response.data === 'object') {
          // Якщо помилка підпису, спробуємо widget
          if (error.response.data.reasonCode === 1113 || error.response.data.reason === 'Invalid signature') {
            try {
              return this.createPaymentViaWidget(requestData, orderReference, paymentAmountInKopecks);
            } catch (widgetError) {
              // Ігноруємо помилку widget
            }
          }
          const errorMsg = error.response.data.reason || error.response.data.errorMessage || error.response.data.message || 'Невідома помилка';
          throw new Error(`WayForPay помилка: ${errorMsg}`);
        }
      } else if (error.request) {
        throw new Error('WayForPay не відповідає. Перевірте інтернет-з\'єднання або спробуйте пізніше.');
      }
      
      if (error.message.includes('WayForPay') || error.message.includes('помилка')) {
        throw error;
      }
      
      throw new Error(`Не вдалося створити платіж: ${error.message}`);
    }
  }

  /**
   * Створює підпис для WayForPay
   * Для CREATE_INVOICE підпис формується БЕЗ returnUrl та serviceUrl
   * Для widget форми (POST до /pay) підпис може бути іншим
   * Підпис = MD5(merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice + secretKey)
   */
  createWayForPaySignature(data, secretKey, isWidget = false, forceHmac = false) {
    // Створюємо копію даних без полів, які не входять в підпис
    const signatureData = {
      merchantAccount: data.merchantAccount,
      merchantDomainName: data.merchantDomainName,
      orderReference: data.orderReference,
      orderDate: data.orderDate,
      amount: data.amount,
      currency: data.currency,
      productName: data.productName,
      productCount: data.productCount,
      productPrice: data.productPrice,
    };

    // Формуємо підпис згідно з документацією WayForPay
    // Порядок: merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice
    let signatureString;
    
    // Стандартна формула для обох випадків (БЕЗ returnUrl/serviceUrl)
    // Порядок: merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice
    signatureString = [
      String(signatureData.merchantAccount),
      String(signatureData.merchantDomainName),
      String(signatureData.orderReference),
      String(signatureData.orderDate),
      String(signatureData.amount),
      String(signatureData.currency),
      signatureData.productName.join(';'),
      signatureData.productCount.join(';'),
      signatureData.productPrice.join(';'),
    ].join(';');
    
    if (!secretKey || secretKey.length === 0) {
      throw new Error('WAYFORPAY_SECRET_KEY порожній! Перевірте налаштування.');
    }
    
    // WayForPay використовує простий MD5 для Create Invoice API
    // Але деякі операції використовують HMAC-MD5
    const simpleMd5Signature = crypto
      .createHash('md5')
      .update(signatureString + secretKey)
      .digest('hex');
    
    const hmacSignature = crypto
      .createHmac('md5', secretKey)
      .update(signatureString)
      .digest('hex');
    
    const useHmac = forceHmac || process.env.WAYFORPAY_USE_HMAC === 'true';
    const signature = useHmac ? hmacSignature : simpleMd5Signature;
    
    return signature;
  }

  /**
   * Створює платіж через WayForPay Widget (використовуємо готову сторінку WayForPay)
   * Створюємо просту HTML-форму, яка автоматично відправляє POST до WayForPay
   */
  createPaymentViaWidget(requestData, orderReference, paymentAmount) {
    // Створюємо URL для проміжної сторінки з ВСІМА параметрами
    // ВАЖЛИВО: передаємо orderDate, щоб він був однаковим для підпису та форми!
    const params = new URLSearchParams({
      merchantAccount: requestData.merchantAccount,
      merchantDomainName: requestData.merchantDomainName,
      orderDate: String(requestData.orderDate), // ВАЖЛИВО: передаємо orderDate!
      amount: String(requestData.amount),
      currency: requestData.currency,
      productName: requestData.productName[0],
      returnUrl: requestData.returnUrl,
      serviceUrl: requestData.serviceUrl,
    });
    
    const formUrl = `${process.env.APP_URL || 'https://your-app.com'}/payment/form/${orderReference}?${params.toString()}`;
    
    return {
      orderId: orderReference,
      checkoutUrl: formUrl,
      amount: paymentAmount / 100, // paymentAmount вже в копійках, конвертуємо в гривні
    };
  }


  /**
   * Перевіряє підпис від WayForPay
   */
  verifyWayForPaySignature(data, signature, secretKey) {
    // Для webhook підпис формується з полів, які прийшли
    const signatureString = [
      data.merchantAccount,
      data.orderReference,
      data.amount,
      data.currency,
      data.authCode,
      data.cardPan,
      data.transactionStatus,
      data.reasonCode,
    ].join(';');

    // WayForPay використовує HMAC-MD5 для верифікації підпису
    const expectedSignature = crypto
      .createHmac('md5', secretKey)
      .update(signatureString)
      .digest('hex');

    return expectedSignature === signature;
  }
}

export const paymentService = new PaymentService();

