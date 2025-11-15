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
    const paymentAmount = amount || config.payment.amount * 100; // В копійках
    
    const orderReference = `creative_${userId}_${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);
    
    const requestData = {
      merchantAccount: config.payment.wayForPayMerchantAccount,
      merchantDomainName: config.payment.merchantDomainName,
      orderReference: orderReference,
      orderDate: orderDate,
      amount: paymentAmount,
      currency: config.payment.currency,
      // Використовуємо латиницю для тестування (кирилиця може викликати проблеми з підписом)
      productName: [process.env.WAYFORPAY_PRODUCT_NAME || 'Generation of creative for Instagram'],
      productCount: [1], // Кількість товарів (завжди 1)
      productPrice: [paymentAmount], // Ціна в копійках
      returnUrl: `${process.env.APP_URL || 'https://your-app.com'}/payment/callback`,
      serviceUrl: `${process.env.APP_URL || 'https://your-app.com'}/payment/webhook`,
    };
    
    // Перевірка правильності даних
    console.log('[WayForPay] Request data validation:', {
      productCount: requestData.productCount,
      productPrice: requestData.productPrice,
      amount: requestData.amount,
      'productCount[0] === 1': requestData.productCount[0] === 1,
      'productPrice[0] === amount': requestData.productPrice[0] === requestData.amount,
      merchantAccount: requestData.merchantAccount,
      merchantDomainName: requestData.merchantDomainName,
      orderReference: requestData.orderReference,
      orderDate: requestData.orderDate,
      productName: requestData.productName[0],
    });
    
    // Перевірка налаштувань
    console.log('[WayForPay] Configuration check:', {
      hasMerchantAccount: !!config.payment.wayForPayMerchantAccount,
      merchantAccount: config.payment.wayForPayMerchantAccount,
      hasSecretKey: !!config.payment.wayForPaySecretKey,
      secretKeyLength: config.payment.wayForPaySecretKey?.length || 0,
      hasMerchantPassword: !!config.payment.wayForPayMerchantPassword,
      merchantPasswordLength: config.payment.wayForPayMerchantPassword?.length || 0,
      merchantDomainName: config.payment.merchantDomainName,
      'merchantDomainName is correct (not merchant account)': !config.payment.merchantDomainName?.includes('t_me_') && config.payment.merchantDomainName?.includes('.'),
    });
    
    // Якщо є MERCHANT PASSWORD, спробуємо використати його як альтернативу
    if (config.payment.wayForPayMerchantPassword) {
      console.log('[WayForPay] Використовуємо MERCHANT PASSWORD замість SECRET KEY');
    }
    
    // Перевірка, чи merchantDomainName не є merchant account
    if (config.payment.merchantDomainName && config.payment.merchantDomainName.includes('t_me_')) {
      console.error('[WayForPay] ⚠️ ПОМИЛКА: MERCHANT_DOMAIN_NAME вказано як merchant account!');
      console.error('[WayForPay] MERCHANT_DOMAIN_NAME має бути доменом (наприклад: smachnoai-production.up.railway.app)');
      console.error('[WayForPay] Поточне значення:', config.payment.merchantDomainName);
      console.error('[WayForPay] Це може бути причиною помилки "Invalid signature"!');
    }
    
    // Перевірка, чи productCount правильний
    if (requestData.productCount[0] !== 1) {
      console.error('[WayForPay] ERROR: productCount має бути [1], але отримано:', requestData.productCount);
      requestData.productCount = [1]; // Виправляємо
    }

    // Перевіряємо наявність обов'язкових полів
    if (!config.payment.wayForPayMerchantAccount) {
      throw new Error('WAYFORPAY_MERCHANT_ACCOUNT не налаштовано');
    }
    if (!config.payment.wayForPaySecretKey) {
      throw new Error('WAYFORPAY_SECRET_KEY не налаштовано');
    }
    if (!config.payment.merchantDomainName || config.payment.merchantDomainName === 'your-domain.com') {
      console.warn('[WayForPay] MERCHANT_DOMAIN_NAME не налаштовано або використовується значення за замовчуванням');
    }

    // Створюємо підпис для WayForPay (БЕЗ returnUrl та serviceUrl)
    // Для API спробуємо використати SECRET KEY (40 символів), для widget - MERCHANT PASSWORD (32 символи)
    // Спочатку спробуємо SECRET KEY для API (оскільки він стандартний 40 символів)
    let secretKeyToUse = config.payment.wayForPaySecretKey || config.payment.wayForPayMerchantPassword;
    
    // Якщо є обидва ключі, спробуємо спочатку SECRET KEY для API (оскільки він стандартний 40 символів)
    if (config.payment.wayForPaySecretKey && config.payment.wayForPaySecretKey.length === 40) {
      console.log('[WayForPay] Використовуємо SECRET KEY (40 символів) для API');
      secretKeyToUse = config.payment.wayForPaySecretKey;
    } else if (config.payment.wayForPayMerchantPassword) {
      console.log('[WayForPay] Використовуємо MERCHANT PASSWORD (32 символи) для API');
      secretKeyToUse = config.payment.wayForPayMerchantPassword;
    }
    
    const signature = this.createWayForPaySignature(requestData, secretKeyToUse, false);
    requestData.merchantSignature = signature;
    
    console.log('[WayForPay] Merchant Account:', config.payment.wayForPayMerchantAccount);
    console.log('[WayForPay] Merchant Domain:', config.payment.merchantDomainName);
    console.log('[WayForPay] Signature created:', signature.substring(0, 10) + '...');
    
    // Альтернативний варіант: використовуємо widget замість API
    // Якщо API не працює, можна використати цей метод
    const useWidget = process.env.WAYFORPAY_USE_WIDGET === 'true';
    
    if (useWidget) {
      return this.createPaymentViaWidget(requestData, orderReference, paymentAmount);
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

      console.log('[WayForPay] Response status:', response.status);
      console.log('[WayForPay] Response data:', JSON.stringify(response.data, null, 2));

      // WayForPay повертає дані в response.data
      if (response.data) {
        // Перевіряємо різні можливі формати відповіді
        if (response.data.invoiceUrl) {
          console.log('[WayForPay] Success - invoiceUrl found');
          return {
            orderId: orderReference,
            checkoutUrl: response.data.invoiceUrl,
            amount: paymentAmount / 100,
          };
        } else if (response.data.url) {
          console.log('[WayForPay] Success - url found');
          return {
            orderId: orderReference,
            checkoutUrl: response.data.url,
            amount: paymentAmount / 100,
          };
        } else if (response.data.errorCode) {
          console.error('[WayForPay] Error response:', response.data);
          throw new Error(`WayForPay помилка: ${response.data.reason || response.data.errorMessage || 'Невідома помилка'}`);
              } else if (response.data.reasonCode === 1113) {
                // Invalid signature - спробуємо використати інший ключ або widget
                console.warn('[WayForPay] API returned invalid signature (reasonCode: 1113)');
                
                // Спробуємо використати інший ключ, якщо є обидва
                if (config.payment.wayForPaySecretKey && config.payment.wayForPayMerchantPassword && secretKeyToUse === config.payment.wayForPayMerchantPassword) {
                  console.log('[WayForPay] Спробуємо використати SECRET KEY замість MERCHANT PASSWORD');
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
                      console.log('[WayForPay] Success with alternative key (SECRET KEY)');
                      return {
                        orderId: orderReference,
                        checkoutUrl: retryResponse.data.invoiceUrl || retryResponse.data.url,
                        amount: paymentAmount / 100,
                      };
                    }
                  } catch (retryError) {
                    console.error('[WayForPay] Retry with alternative key also failed:', retryError.message);
                  }
                }
                
                // Якщо альтернативний ключ не допоміг, спробуємо widget
                console.warn('[WayForPay] Trying widget method as fallback...');
                return this.createPaymentViaWidget(requestData, orderReference, paymentAmount);
              } else {
                console.error('[WayForPay] Unexpected response format:', response.data);
                // Якщо це помилка підпису, спробуємо widget
                if (response.data.reasonCode === 1113) {
                  console.warn('[WayForPay] Trying widget method as fallback...');
                  return this.createPaymentViaWidget(requestData, orderReference, paymentAmount);
                }
                throw new Error(`WayForPay повернув неочікуваний формат відповіді: ${JSON.stringify(response.data)}`);
              }
      }
      
      throw new Error('Invalid response from WayForPay - response.data is empty');
    } catch (error) {
      console.error('[WayForPay] Error creating payment:', error.message);
      
      if (error.response) {
        console.error('[WayForPay] Response status:', error.response.status);
        console.error('[WayForPay] Response headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('[WayForPay] Response data:', error.response.data);
        
        // Якщо отримали HTML, це означає неправильний endpoint
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
          throw new Error('Неправильна конфігурація WayForPay API endpoint. Перевірте документацію WayForPay.');
        }
        
        // Якщо отримали помилку від API
        if (error.response.data && typeof error.response.data === 'object') {
          // Якщо помилка підпису, спробуємо widget
          if (error.response.data.reasonCode === 1113 || error.response.data.reason === 'Invalid signature') {
            console.warn('[WayForPay] Invalid signature error, trying widget method...');
            try {
              return this.createPaymentViaWidget(requestData, orderReference, paymentAmount);
            } catch (widgetError) {
              console.error('[WayForPay] Widget method also failed:', widgetError);
            }
          }
          const errorMsg = error.response.data.reason || error.response.data.errorMessage || error.response.data.message || 'Невідома помилка';
          throw new Error(`WayForPay помилка: ${errorMsg}`);
        }
      } else if (error.request) {
        console.error('[WayForPay] No response received:', error.request);
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
  createWayForPaySignature(data, secretKey, isWidget = false) {
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
    
    // Для widget форми та API використовуємо однакову формулу підпису
    // (БЕЗ returnUrl та serviceUrl) - це стандартна формула WayForPay
    if (isWidget) {
      console.log('[WayForPay] Widget form - using standard signature (without returnUrl/serviceUrl)');
    } else {
      console.log('[WayForPay] API - using standard signature (without returnUrl/serviceUrl)');
    }
    
    // Стандартна формула для обох випадків (БЕЗ returnUrl/serviceUrl)
    // Це стандартна формула WayForPay для всіх типів запитів
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
    
    console.log(`[WayForPay] ${isWidget ? 'Widget' : 'API'} signature string (standard, without returnUrl/serviceUrl):`, signatureString);
    console.log(`[WayForPay] Secret key length: ${secretKey?.length || 0} characters`);
    console.log(`[WayForPay] Secret key: ${secretKey}`);
    
    // Перевірка, чи secretKey не порожній
    if (!secretKey || secretKey.length === 0) {
      throw new Error('WAYFORPAY_SECRET_KEY порожній! Перевірте налаштування.');
    }
    
    // Перевірка, чи secretKey має правильну довжину (зазвичай 40 символів для WayForPay)
    if (secretKey.length !== 40) {
      console.warn(`[WayForPay] ⚠️ Secret key має нестандартну довжину: ${secretKey.length} (очікується 40)`);
    }
    
    // WayForPay може використовувати або HMAC-MD5, або простий MD5
    // Спробуємо обидва варіанти для діагностики
    // Згідно з документацією, для Create Invoice використовується простий MD5
    // Але деякі операції використовують HMAC-MD5
    
    // Спочатку спробуємо простий MD5 (це стандарт для Create Invoice)
    const simpleMd5Signature = crypto
      .createHash('md5')
      .update(signatureString + secretKey)
      .digest('hex');
    
    // Також створимо HMAC-MD5 для порівняння
    const hmacSignature = crypto
      .createHmac('md5', secretKey)
      .update(signatureString)
      .digest('hex');
    
    // Використовуємо простий MD5 (це стандарт для Create Invoice API)
    // Якщо не працює, можна спробувати HMAC-MD5 через змінну оточення
    const useHmac = process.env.WAYFORPAY_USE_HMAC === 'true';
    const signature = useHmac ? hmacSignature : simpleMd5Signature;
    
    console.log('[WayForPay] Using signature method:', useHmac ? 'HMAC-MD5' : 'Simple MD5 (standard for Create Invoice)');
    console.log('[WayForPay] Simple MD5 signature:', simpleMd5Signature);
    console.log('[WayForPay] HMAC-MD5 signature (alternative):', hmacSignature);
    
    console.log('[WayForPay] Calculated signature:', signature);
    console.log('[WayForPay] Full signature string (with key):', signatureString + '[' + secretKey.substring(0, 4) + '...]');
    
    // Додаткова діагностика: спробуємо альтернативні варіанти (якщо потрібно)
    if (process.env.WAYFORPAY_DEBUG_SIGNATURE === 'true') {
      // Варіант 2: з returnUrl та serviceUrl
      const signatureString2 = [
        String(signatureData.merchantAccount),
        String(signatureData.merchantDomainName),
        String(signatureData.orderReference),
        String(signatureData.orderDate),
        String(signatureData.amount),
        String(signatureData.currency),
        signatureData.productName.join(';'),
        signatureData.productCount.join(';'),
        signatureData.productPrice.join(';'),
        data.returnUrl || '',
        data.serviceUrl || '',
      ].join(';');
      
      const signature2Hmac = crypto
        .createHmac('md5', secretKey)
        .update(signatureString2)
        .digest('hex');
      
      const signature2Simple = crypto
        .createHash('md5')
        .update(signatureString2 + secretKey)
        .digest('hex');
      
      console.log('[WayForPay] DEBUG: Alternative signature (with returnUrl/serviceUrl) - HMAC-MD5:', signature2Hmac);
      console.log('[WayForPay] DEBUG: Alternative signature (with returnUrl/serviceUrl) - Simple MD5:', signature2Simple);
      console.log('[WayForPay] DEBUG: Alternative signature string:', signatureString2);
    }
    
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
    
    console.log('[WayForPay] Using widget method - готова форма WayForPay');
    console.log('[WayForPay] Form URL with orderDate:', requestData.orderDate);
    
    return {
      orderId: orderReference,
      checkoutUrl: formUrl,
      amount: paymentAmount / 100,
    };
  }

  /**
   * Створює HTML-форму для WayForPay (готову сторінку)
   */
  createWayForPayForm(requestData) {
    // Екрануємо значення для HTML
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    return `<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата через WayForPay</title>
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
        <p>Перенаправлення на сторінку оплати WayForPay...</p>
    </div>
    <form id="wayforpayForm" method="POST" action="https://secure.wayforpay.com/pay">
        <input type="hidden" name="merchantAccount" value="${escapeHtml(requestData.merchantAccount)}">
        <input type="hidden" name="merchantDomainName" value="${escapeHtml(requestData.merchantDomainName)}">
        <input type="hidden" name="orderReference" value="${escapeHtml(requestData.orderReference)}">
        <input type="hidden" name="orderDate" value="${escapeHtml(String(requestData.orderDate))}">
        <input type="hidden" name="amount" value="${escapeHtml(String(requestData.amount))}">
        <input type="hidden" name="currency" value="${escapeHtml(requestData.currency)}">
        <input type="hidden" name="productName[]" value="${escapeHtml(requestData.productName[0])}">
        <input type="hidden" name="productCount[]" value="${escapeHtml(String(requestData.productCount[0]))}">
        <input type="hidden" name="productPrice[]" value="${escapeHtml(String(requestData.productPrice[0]))}">
        <input type="hidden" name="returnUrl" value="${escapeHtml(requestData.returnUrl)}">
        <input type="hidden" name="serviceUrl" value="${escapeHtml(requestData.serviceUrl)}">
        <input type="hidden" name="merchantSignature" value="${escapeHtml(requestData.merchantSignature)}">
    </form>
    <script>
        // Автоматично відправляємо форму
        document.getElementById('wayforpayForm').submit();
    </script>
</body>
</html>`;
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

