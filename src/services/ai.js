import OpenAI from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export class AIService {
  /**
   * Генерує зображення на основі промпту та стилю
   * @param {string} prompt - Опис зображення
   * @param {string} style - Стиль генерації (bright, premium, cozy, wedding, custom)
   * @param {string} customWishes - Додаткові побажання користувача (опціонально)
   * @param {number} n - Кількість варіантів (1-2)
   * @returns {Promise<Array<string>>} Масив URL зображень
   */
  async generateImage(prompt, style = null, customWishes = null, n = 2) {
    try {
      // Базовий промпт з акцентом на реалістичність
      let enhancedPrompt = `Professional realistic food photography: ${prompt}. 
        Photorealistic, high resolution, natural lighting, real food texture, 
        authentic appearance, professional food styling, natural shadows and highlights, 
        realistic depth of field, natural colors, no artificial or cartoon-like appearance, 
        suitable for professional Instagram food photography.`;

      // Додаємо стильові характеристики з акцентом на реалістичність
      const stylePrompts = {
        bright: 'Vibrant natural colors, fresh and appetizing realistic look, bright natural daylight, colorful realistic background, energetic and lively atmosphere, photorealistic food photography, natural textures, real ingredients.',
        premium: 'Luxury realistic pastry shop aesthetic, elegant photorealistic presentation, sophisticated natural styling, premium quality realistic look, refined natural composition, high-end bakery atmosphere, elegant realistic background, professional patisserie photography style, natural lighting.',
        cozy: 'Cozy realistic cafe atmosphere, warm and inviting natural lighting, rustic or vintage realistic style, comfortable and homely feeling, perfect for coffee shop Instagram, warm natural color palette, intimate realistic setting, natural textures.',
        wedding: 'Wedding cake realistic aesthetic, elegant and romantic photorealistic style, soft natural pastel colors, delicate realistic decorations, sophisticated and refined natural appearance, perfect for special occasions, elegant realistic composition, celebration photography style.',
        custom: ''
      };

      if (style && stylePrompts[style]) {
        enhancedPrompt += ' ' + stylePrompts[style];
      }

      // Додаємо додаткові побажання користувача
      if (customWishes && customWishes.trim()) {
        enhancedPrompt += ` Additional requirements: ${customWishes}.`;
      }
      
      // Додаємо фінальне нагадування про реалістичність
      enhancedPrompt += ' Photorealistic, no illustration style, no cartoon, no digital art, real photography.';

      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: Math.min(n, 1), // DALL-E 3 підтримує тільки 1 зображення за раз
        size: '1024x1024',
        quality: 'hd', // HD якість для більшої реалістичності
      });

      const imageUrls = [];
      for (const image of response.data) {
        imageUrls.push(image.url);
      }

      // Якщо потрібно 2 зображення, генеруємо ще одне з трохи іншим промптом
      if (n > 1 && imageUrls.length === 1) {
        // Невелика затримка між запитами
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const secondPrompt = enhancedPrompt + ' Different angle, alternative composition, slightly different styling and perspective.';
        const secondResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: secondPrompt,
          n: 1,
          size: '1024x1024',
          quality: 'hd', // HD якість для більшої реалістичності
        });
        if (secondResponse.data && secondResponse.data[0]) {
          imageUrls.push(secondResponse.data[0].url);
        }
      }

      return imageUrls;
    } catch (error) {
      console.error('Error generating image:', error);
      throw new Error('Не вдалося згенерувати зображення. Спробуйте ще раз.');
    }
  }

  /**
   * Генерує підпис до посту українською
   * @param {string} prompt - Опис виробу
   * @param {string} imageDescription - Опис зображення (опціонально)
   * @returns {Promise<string>} Підпис до посту
   */
  async generateCaption(prompt, imageDescription = '') {
    try {
      const systemPrompt = `Ти експерт з маркетингу для пекарень та кав'ярень. 
        Створюй короткі, привабливі підписи до постів в Instagram українською мовою.
        Використовуй емодзі, хештеги та створюй атмосферу затишку та апетиту.
        Підпис має бути 1-2 речення, максимум 200 символів.`;

      const userPrompt = `Створи підпис до Instagram-посту для такого виробу: ${prompt}
        ${imageDescription ? `\nОпис зображення: ${imageDescription}` : ''}
        
        Підпис має бути українською мовою, з емодзі та релевантними хештегами.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 200,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating caption:', error);
      // Fallback підпис
      return `Смачний виріб від нашої пекарні! 🍰✨ #пекарня #десерт #солодкещастя`;
    }
  }

  /**
   * Аналізує завантажене фото та створює опис
   * @param {string} imageUrl - URL зображення
   * @returns {Promise<string>} Опис зображення
   */
  async analyzeImage(imageUrl) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Опиши це зображення детально українською мовою. Що на фото? Які кольори, текстури, стиль? Це для генерації Instagram-посту для пекарні.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 300,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error analyzing image:', error);
      return 'Фото виробу для Instagram-посту';
    }
  }
}

export const aiService = new AIService();

