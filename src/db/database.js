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

  async updatePaymentStatus(paymentId, status) {
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
    return data;
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

