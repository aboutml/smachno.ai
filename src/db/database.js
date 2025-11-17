import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const supabase = createClient(config.supabase.url, config.supabase.key);

export class Database {
  // Користувачі
  async getUserByTelegramId(telegramId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error getting user:', error);
      return null;
    }
    
    return data;
  }

  async createOrUpdateUser(telegramId, userData) {
    const existingUser = await this.getUserByTelegramId(telegramId);
    
    if (existingUser) {
      const { data, error } = await supabase
        .from('users')
        .update({
          username: userData.username,
          first_name: userData.first_name,
          updated_at: new Date().toISOString(),
        })
        .eq('telegram_id', telegramId)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating user:', error);
        return null;
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          username: userData.username,
          first_name: userData.first_name,
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating user:', error);
        return null;
      }
      return data;
    }
  }

  async incrementFreeGenerations(telegramId) {
    const user = await this.getUserByTelegramId(telegramId);
    if (!user) return null;

    const { data, error } = await supabase
      .from('users')
      .update({
        free_generations_used: (user.free_generations_used || 0) + 1,
        total_generations: (user.total_generations || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) {
      console.error('Error incrementing generations:', error);
      return null;
    }
    return data;
  }

  // Креативи
  async saveCreative(userId, creativeData) {
    const { data, error } = await supabase
      .from('creatives')
      .insert({
        user_id: userId,
        original_photo_url: creativeData.originalPhotoUrl,
        prompt: creativeData.prompt,
        generated_image_url: creativeData.generatedImageUrl,
        caption: creativeData.caption,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving creative:', error);
      return null;
    }
    return data;
  }

  async getUserCreatives(telegramId, limit = 5) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      if (!user) {
        console.log(`[getUserCreatives] User ${telegramId} not found in database`);
        return [];
      }

      console.log(`[getUserCreatives] Looking for creatives for user_id: ${user.id}`);

      const { data, error } = await supabase
        .from('creatives')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[getUserCreatives] Error getting creatives:', error);
        return [];
      }

      console.log(`[getUserCreatives] Found ${data?.length || 0} creatives for user ${user.id}`);
      return data || [];
    } catch (error) {
      console.error('[getUserCreatives] Exception:', error);
      return [];
    }
  }

  // Платежі
  async createPayment(userId, amount, currency, paymentId) {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        amount,
        currency,
        payment_id: paymentId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating payment:', error);
      return null;
    }
    return data;
  }

  /**
   * Отримує платіж за payment_id
   * @param {string} paymentId - Payment ID (orderReference)
   * @returns {Object|null} Дані про платіж або null
   */
  async getPaymentByPaymentId(paymentId) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_id', paymentId)
      .maybeSingle();
    
    if (error) {
      console.error('[getPaymentByPaymentId] Error getting payment:', error);
      return null;
    }
    
    return data;
  }

  async updatePaymentStatus(paymentId, status, userId = null, amount = null, currency = null) {
    // Спочатку перевіряємо, чи існує платіж
    const { data: existingPayment, error: checkError } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_id', paymentId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking payment:', checkError);
    }

    // Якщо платіж не існує, створюємо його (upsert)
    if (!existingPayment) {
      console.log(`[updatePaymentStatus] Payment ${paymentId} not found, creating new payment record`);
      
      // Якщо userId не передано, намагаємося витягти telegram_id з paymentId (формат: creative_123456789_timestamp)
      let extractedTelegramId = null;
      if (!userId && paymentId && typeof paymentId === 'string') {
        const match = paymentId.match(/creative_(\d+)_/);
        if (match) {
          extractedTelegramId = parseInt(match[1]);
          console.log(`[updatePaymentStatus] Extracted telegram_id ${extractedTelegramId} from paymentId ${paymentId}`);
        }
      }

      // Знаходимо користувача за telegram_id або використовуємо переданий userId
      let userToUse = null;
      if (userId) {
        // Якщо userId передано, перевіряємо, чи це внутрішній ID або telegram_id
        const { data: userById } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .single();
        
        if (userById) {
          userToUse = userById;
        } else {
          // Можливо, це telegram_id
          const { data: userByTelegramId } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', userId)
            .single();
          
          if (userByTelegramId) {
            userToUse = userByTelegramId;
          }
        }
      } else if (extractedTelegramId) {
        // Знаходимо користувача за telegram_id
        let userByTelegramId = await this.getUserByTelegramId(extractedTelegramId);
        
        if (userByTelegramId) {
          userToUse = { id: userByTelegramId.id };
        } else {
          // Якщо користувача немає, створюємо його
          console.log(`[updatePaymentStatus] User with telegram_id ${extractedTelegramId} not found, creating new user`);
          const newUser = await this.createOrUpdateUser(extractedTelegramId, {
            username: null,
            first_name: null,
          });
          
          if (newUser) {
            userToUse = { id: newUser.id };
            console.log(`[updatePaymentStatus] Created new user with id ${newUser.id} for telegram_id ${extractedTelegramId}`);
          } else {
            console.error(`[updatePaymentStatus] Failed to create user with telegram_id ${extractedTelegramId}`);
          }
        }
      }

      if (!userToUse || !userToUse.id) {
        console.error(`[updatePaymentStatus] Cannot create payment: user not found. userId=${userId}, extractedTelegramId=${extractedTelegramId}`);
        return null;
      }

      const internalUserId = userToUse.id;
      console.log(`[updatePaymentStatus] Using internal user_id ${internalUserId} for payment`);

      // Створюємо новий платіж
      const { data: newPayment, error: createError } = await supabase
        .from('payments')
        .insert({
          user_id: internalUserId,
          amount: amount || 0,
          currency: currency || 'UAH',
          payment_id: paymentId,
          status: status,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating payment:', createError);
        return null;
      }
      
      console.log(`[updatePaymentStatus] Created new payment record for ${paymentId}`);
      
      // Якщо платіж створюється зі статусом completed, оновлюємо total_paid
      // Рефанди не рахуються як оплата, тому не збільшуємо total_paid
      if (status === 'completed' && newPayment) {
        const userIdToUpdate = newPayment.user_id;
        const paymentAmount = newPayment.amount || amount || 0;
        
        if (userIdToUpdate && paymentAmount > 0) {
          console.log(`[updatePaymentStatus] Incrementing total_paid for user ${userIdToUpdate} by ${paymentAmount} (new payment)`);
          await this.incrementUserTotalPaid(userIdToUpdate, paymentAmount);
        }
      } else if (status === 'refunded') {
        console.log(`[updatePaymentStatus] Payment ${paymentId} created with refunded status - not incrementing total_paid`);
      }
      
      return newPayment;
    }

    // Якщо платіж існує, оновлюємо його
    // Зберігаємо старий статус для перевірки
    const oldStatus = existingPayment?.status;
    
    const { data, error } = await supabase
      .from('payments')
      .update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating payment:', error);
      return null;
    }
    
    console.log(`[updatePaymentStatus] Updated payment ${paymentId} to status ${status} (was: ${oldStatus || 'new'})`);
    
    const paymentToUse = data || existingPayment;
    if (!paymentToUse) {
      return data;
    }
    
    const userIdToUpdate = paymentToUse.user_id;
    const paymentAmount = paymentToUse.amount || amount || 0;
    
    // Обробка різних статусів платежу
    if (status === 'completed' && oldStatus !== 'completed') {
      // Платіж став успішним - збільшуємо total_paid
      if (userIdToUpdate && paymentAmount > 0) {
        console.log(`[updatePaymentStatus] Incrementing total_paid for user ${userIdToUpdate} by ${paymentAmount}`);
        await this.incrementUserTotalPaid(userIdToUpdate, paymentAmount);
      } else {
        console.warn(`[updatePaymentStatus] Cannot increment total_paid: userId=${userIdToUpdate}, amount=${paymentAmount}`);
      }
    } else if (status === 'refunded' && oldStatus === 'completed') {
      // Платіж був успішним, але тепер рефанд - зменшуємо total_paid
      if (userIdToUpdate && paymentAmount > 0) {
        console.log(`[updatePaymentStatus] Decrementing total_paid for user ${userIdToUpdate} by ${paymentAmount} (refund)`);
        await this.decrementUserTotalPaid(userIdToUpdate, paymentAmount);
      } else {
        console.warn(`[updatePaymentStatus] Cannot decrement total_paid: userId=${userIdToUpdate}, amount=${paymentAmount}`);
      }
    } else if (status === 'completed' && oldStatus === 'completed') {
      console.log(`[updatePaymentStatus] Payment ${paymentId} was already completed, skipping total_paid update`);
    } else if (status === 'refunded' && oldStatus === 'refunded') {
      console.log(`[updatePaymentStatus] Payment ${paymentId} was already refunded, skipping total_paid update`);
    }
    
    return data;
  }

  /**
   * Збільшує total_paid користувача на вказану суму
   */
  async incrementUserTotalPaid(userId, amount) {
    try {
      // Спочатку отримуємо поточне значення total_paid
      const { data: user, error: getUserError } = await supabase
        .from('users')
        .select('total_paid')
        .eq('id', userId)
        .single();

      if (getUserError) {
        console.error('[incrementUserTotalPaid] Error getting user:', getUserError);
        return;
      }

      const currentTotalPaid = user?.total_paid || 0;
      const newTotalPaid = currentTotalPaid + (amount || 0);

      // Оновлюємо total_paid
      const { error: updateError } = await supabase
        .from('users')
        .update({
          total_paid: newTotalPaid,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('[incrementUserTotalPaid] Error updating total_paid:', updateError);
      } else {
        console.log(`[incrementUserTotalPaid] Updated user ${userId} total_paid: ${currentTotalPaid} -> ${newTotalPaid} (+${amount})`);
      }
    } catch (error) {
      console.error('[incrementUserTotalPaid] Exception:', error);
    }
  }

  /**
   * Зменшує total_paid користувача на вказану суму (для рефандів)
   */
  async decrementUserTotalPaid(userId, amount) {
    try {
      // Спочатку отримуємо поточне значення total_paid
      const { data: user, error: getUserError } = await supabase
        .from('users')
        .select('total_paid')
        .eq('id', userId)
        .single();

      if (getUserError) {
        console.error('[decrementUserTotalPaid] Error getting user:', getUserError);
        return;
      }

      const currentTotalPaid = user?.total_paid || 0;
      const newTotalPaid = Math.max(0, currentTotalPaid - (amount || 0)); // Не дозволяємо від'ємні значення

      // Оновлюємо total_paid
      const { error: updateError } = await supabase
        .from('users')
        .update({
          total_paid: newTotalPaid,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('[decrementUserTotalPaid] Error updating total_paid:', updateError);
      } else {
        console.log(`[decrementUserTotalPaid] Updated user ${userId} total_paid: ${currentTotalPaid} -> ${newTotalPaid} (-${amount})`);
      }
    } catch (error) {
      console.error('[decrementUserTotalPaid] Exception:', error);
    }
  }

  /**
   * Отримує кількість доступних оплачених генерацій для користувача
   * @param {number} telegramId - Telegram ID користувача
   * @returns {number} - кількість доступних оплачених генерацій
   */
  async getAvailablePaidGenerations(telegramId) {
    try {
      // Спочатку знаходимо користувача
      const user = await this.getUserByTelegramId(telegramId);
      if (!user) {
        return 0;
      }

      // Рахуємо кількість успішних платежів
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'completed');

      if (error) {
        console.error('[getAvailablePaidGenerations] Error checking payments:', error);
        return 0;
      }

      const completedPaymentsCount = payments?.length || 0;
      const paidGenerationsUsed = user.paid_generations_used || 0;
      
      // Використовуємо config для отримання кількості генерацій за оплату
      const paidGenerationsPerPayment = config.app.paidGenerationsPerPayment || 2;
      
      const totalPaidGenerationsAvailable = completedPaymentsCount * paidGenerationsPerPayment;
      
      // Якщо використано більше, ніж доступно (можливо через помилку в минулому),
      // обмежуємо використані до доступних, щоб не показувати від'ємне значення
      const correctedPaidGenerationsUsed = Math.min(paidGenerationsUsed, totalPaidGenerationsAvailable);
      const availablePaidGenerations = Math.max(0, totalPaidGenerationsAvailable - correctedPaidGenerationsUsed);
      
      // Якщо була корекція, логуємо це
      if (paidGenerationsUsed > totalPaidGenerationsAvailable) {
        console.warn(`[getAvailablePaidGenerations] User ${telegramId}: Data inconsistency detected! Used ${paidGenerationsUsed} but only ${totalPaidGenerationsAvailable} available. Correcting to ${correctedPaidGenerationsUsed}.`);
      }
      
      console.log(`[getAvailablePaidGenerations] User ${telegramId}: completed payments: ${completedPaymentsCount}, used: ${paidGenerationsUsed} (corrected: ${correctedPaidGenerationsUsed}), available: ${availablePaidGenerations}`);
      console.log(`[getAvailablePaidGenerations] Calculation: ${completedPaymentsCount} payments × ${paidGenerationsPerPayment} per payment = ${totalPaidGenerationsAvailable} total, minus ${correctedPaidGenerationsUsed} used = ${availablePaidGenerations} available`);
      
      return availablePaidGenerations;
    } catch (error) {
      console.error('[getAvailablePaidGenerations] Exception:', error);
      return 0;
    }
  }

  /**
   * Збільшує лічильник використаних оплачених генерацій
   * @param {number} telegramId - Telegram ID користувача
   */
  async incrementPaidGenerations(telegramId) {
    try {
      const user = await this.getUserByTelegramId(telegramId);
      if (!user) {
        console.error('[incrementPaidGenerations] User not found');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          paid_generations_used: (user.paid_generations_used || 0) + 1,
          total_generations: (user.total_generations || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('telegram_id', telegramId)
        .select()
        .single();

      if (error) {
        console.error('[incrementPaidGenerations] Error updating user:', error);
      } else {
        console.log(`[incrementPaidGenerations] Updated paid_generations_used for user ${telegramId}: ${user.paid_generations_used || 0} -> ${data.paid_generations_used}`);
      }
    } catch (error) {
      console.error('[incrementPaidGenerations] Exception:', error);
    }
  }

  // Статистика для адміна
  async getStats() {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id');

    const { data: creatives, error: creativesError } = await supabase
      .from('creatives')
      .select('id');

    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount, status')
      .eq('status', 'completed');

    if (usersError || creativesError || paymentsError) {
      console.error('Error getting stats:', { usersError, creativesError, paymentsError });
      return null;
    }

    const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    return {
      totalUsers: users?.length || 0,
      totalCreatives: creatives?.length || 0,
      totalRevenue,
    };
  }
}

export const db = new Database();

