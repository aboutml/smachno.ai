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

    // Створюємо підпис для WayForPay
    const signature = this.createWayForPaySignature(requestData, config.payment.wayForPaySecretKey);
    requestData.merchantSignature = signature;

    try {
      // Викликаємо WayForPay API для створення інвойсу
      // Правильний endpoint для WayForPay API
      const response = await axios.post(
        'https://api.wayforpay.com/api',
        {
          transactionType: 'CREATE_INVOICE',
          ...requestData,
        },
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
            amount: paymentAmount / 100,
          };
        } else if (response.data.url) {
          return {
            orderId: orderReference,
            checkoutUrl: response.data.url,
            amount: paymentAmount / 100,
          };
        } else if (response.data.errorCode) {
          console.error('WayForPay error:', response.data);
          throw new Error(`WayForPay помилка: ${response.data.reason || response.data.errorMessage || 'Невідома помилка'}`);
        }
      }
      
      throw new Error('Invalid response from WayForPay');
    } catch (error) {
      console.error('Error creating WayForPay payment:', error);
      if (error.response) {
        console.error('WayForPay status:', error.response.status);
        console.error('WayForPay headers:', error.response.headers);
        // Якщо отримали HTML, це означає неправильний endpoint
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
          throw new Error('Неправильна конфігурація WayForPay. Перевірте налаштування в адмін-панелі.');
        }
        console.error('WayForPay response:', error.response.data);
      }
      if (error.message.includes('WayForPay')) {
        throw error;
      }
      throw new Error('Не вдалося створити платіж. Перевірте налаштування WayForPay або спробуйте пізніше.');
    }
  }

  /**
   * Створює підпис для WayForPay
   * Підпис = MD5(merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice + secretKey)
   */
  createWayForPaySignature(data, secretKey) {
    const signatureString = [
      data.merchantAccount,
      data.merchantDomainName,
      data.orderReference,
      data.orderDate,
      data.amount,
      data.currency,
      data.productName.join(';'),
      data.productCount.join(';'),
      data.productPrice.join(';'),
    ].join(';');

    return crypto
      .createHash('md5')
      .update(signatureString + secretKey)
      .digest('hex');
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

