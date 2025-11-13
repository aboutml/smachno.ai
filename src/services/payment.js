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
      productName: ['Генерація креативу для Instagram'],
      productCount: [1],
      productPrice: [paymentAmount],
      returnUrl: `${process.env.APP_URL || 'https://your-app.com'}/payment/callback`,
      serviceUrl: `${process.env.APP_URL || 'https://your-app.com'}/payment/webhook`,
    };

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
    const signature = this.createWayForPaySignature(requestData, config.payment.wayForPaySecretKey);
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
      const requestPayload = {
        transactionType: 'CREATE_INVOICE',
        apiVersion: 1,
        ...requestData,
      };

      console.log('[WayForPay] Request payload:', JSON.stringify(requestPayload, null, 2));
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
          // Invalid signature - спробуємо використати widget
          console.warn('[WayForPay] API returned invalid signature, trying widget method...');
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
   * Підпис = MD5(merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice + secretKey)
   */
  createWayForPaySignature(data, secretKey) {
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
    const signatureString = [
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

    console.log('[WayForPay] Signature string (without key):', signatureString);
    
    const signature = crypto
      .createHash('md5')
      .update(signatureString + secretKey)
      .digest('hex');
    
    console.log('[WayForPay] Calculated signature:', signature);
    
    return signature;
  }

  /**
   * Створює платіж через WayForPay Widget (альтернативний метод, якщо API не працює)
   * WayForPay widget вимагає POST-запит, тому створюємо проміжну HTML-сторінку
   */
  createPaymentViaWidget(requestData, orderReference, paymentAmount) {
    // Створюємо URL для проміжної сторінки з параметрами
    const params = new URLSearchParams({
      merchantAccount: requestData.merchantAccount,
      merchantDomainName: requestData.merchantDomainName,
      orderDate: String(requestData.orderDate),
      amount: String(requestData.amount),
      currency: requestData.currency,
      productName: requestData.productName[0],
      returnUrl: requestData.returnUrl,
      serviceUrl: requestData.serviceUrl,
    });
    
    const intermediateUrl = `${process.env.APP_URL || 'https://your-app.com'}/payment/form/${orderReference}?${params.toString()}`;
    
    console.log('[WayForPay] Using widget method via intermediate page');
    
    return {
      orderId: orderReference,
      checkoutUrl: intermediateUrl,
      amount: paymentAmount / 100,
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

    const expectedSignature = crypto
      .createHash('md5')
      .update(signatureString + secretKey)
      .digest('hex');

    return expectedSignature === signature;
  }
}

export const paymentService = new PaymentService();

