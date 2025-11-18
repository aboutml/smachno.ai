import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';
import { config } from '../config.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

// Ініціалізуємо Gemini тільки якщо є API ключ
let geminiClient = null;
if (config.gemini.apiKey) {
  try {
    geminiClient = new GoogleGenAI({
      apiKey: config.gemini.apiKey,
    });
    console.log('✅ Gemini client initialized successfully');
  } catch (error) {
    console.warn('⚠️  Warning: Failed to initialize Gemini client:', error.message);
  }
} else {
  console.log('ℹ️  Gemini API key not set, using DALL-E 3 for image generation');
}

export class AIService {
  /**
   * Генерує зображення на основі промпту та стилю
   * @param {string} prompt - Опис зображення
   * @param {string} style - Стиль генерації (bright, premium, cozy, wedding, custom)
   * @param {string} customWishes - Додаткові побажання користувача (опціонально)
   * @param {number} n - Кількість варіантів (1-2)
   * @param {string} originalImageUrl - URL оригінального зображення (для image-to-image редагування через Gemini)
   * @returns {Promise<Array<string>>} Масив URL зображень
   */
  async generateImage(prompt, style = null, customWishes = null, n = 2, originalImageUrl = null) {
    // Використовуємо Gemini (Nano Banana) якщо:
    // 1. Модель явно встановлена як gemini-2.5-flash-image АБО
    // 2. Gemini клієнт ініціалізований (є API ключ) і є оригінальне зображення (image-to-image редагування)
    // Gemini краще для image-to-image, тому пріоритет йому
    const useGemini = config.ai.imageModel === 'gemini-2.5-flash-image' || 
                      (geminiClient && originalImageUrl);
    
    if (useGemini && geminiClient) {
      try {
        console.log('🎨 Using Gemini 2.5 Flash Image (Nano Banana) for image-to-image editing');
        return await this.generateImageWithGemini(prompt, style, customWishes, n, originalImageUrl);
      } catch (error) {
        console.error('Gemini generation failed, falling back to DALL-E 3:', error);
        // Fallback до DALL-E 3
      }
    } else if (geminiClient && !originalImageUrl) {
      console.log('ℹ️  Gemini available but no original image provided, using DALL-E 3');
    } else if (!geminiClient) {
      console.log('ℹ️  Gemini not configured, using DALL-E 3');
    }
    
    // Використовуємо DALL-E 3
    console.log('🎨 Using DALL-E 3 for image generation');
    return this.generateImageWithDALLE(prompt, style, customWishes, n);
  }

  /**
   * Генерує зображення через Gemini 2.5 Flash Image (Nano Banana) з image-to-image редагуванням
   * @param {string} prompt - Опис зображення
   * @param {string} style - Стиль генерації
   * @param {string} customWishes - Додаткові побажання
   * @param {number} n - Кількість варіантів
   * @param {string} originalImageUrl - URL оригінального зображення
   * @returns {Promise<Array<string>>} Масив URL зображень
   */
  async generateImageWithGemini(prompt, style = null, customWishes = null, n = 2, originalImageUrl = null) {
    try {
      if (!geminiClient) {
        throw new Error('Gemini client not initialized');
      }

      // Формуємо промпт для редагування зображення з акцентом на максимальну реалістичність
      let enhancedPrompt = `Transform this food photography into a highly realistic, professional Instagram-quality image: ${prompt}. 
        Make it look absolutely photorealistic - like a real professional food photographer took this photo. 
        Enhance lighting to be natural and flattering, improve composition and styling, add realistic depth of field. 
        Keep the main subject authentic but make it look premium and appetizing. 
        Use natural shadows, realistic textures, authentic colors - no artificial or digital-looking effects. 
        The result should look like a real high-end food photography shot, not AI-generated.`;

      // Додаємо стильові характеристики
      const stylePrompts = {
        bright: 'Apply vibrant, juicy colors, fresh and appetizing look, bright natural daylight, colorful realistic background, energetic and lively atmosphere.',
        premium: 'Transform into luxury realistic pastry shop aesthetic, elegant photorealistic presentation, sophisticated natural styling, premium quality look, refined natural composition, high-end bakery atmosphere.',
        cozy: 'Apply cozy realistic cafe atmosphere, warm and inviting natural lighting, rustic or vintage realistic style, comfortable and homely feeling, warm natural color palette.',
        wedding: 'Transform into wedding cake realistic aesthetic, elegant and romantic photorealistic style, soft natural pastel colors, delicate realistic decorations, sophisticated and refined natural appearance.',
        custom: ''
      };

      if (style && stylePrompts[style]) {
        enhancedPrompt += ' ' + stylePrompts[style];
      }

      if (customWishes && customWishes.trim()) {
        enhancedPrompt += ` Additional requirements: ${customWishes}.`;
      }

      enhancedPrompt += ' Absolutely photorealistic, hyper-realistic, looks like real professional photography, no illustration style, no cartoon, no digital art, no AI-generated look, real camera photo quality.';

      const imageUrls = [];

      // Завантажуємо оригінальне зображення
      let imageData = null;
      if (originalImageUrl) {
        try {
          const imageResponse = await fetch(originalImageUrl);
          const imageBuffer = await imageResponse.arrayBuffer();
          imageData = Buffer.from(imageBuffer).toString('base64');
        } catch (error) {
          console.error('Error loading original image for Gemini:', error);
          // Якщо не вдалося завантажити, використовуємо text-to-image
          originalImageUrl = null;
        }
      }

      // Генеруємо зображення
      for (let i = 0; i < Math.min(n, 2); i++) {
        try {
          let contents;
          
          if (originalImageUrl && imageData) {
            // Image-to-image редагування
            contents = [
              { text: enhancedPrompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageData,
                },
              },
            ];
          } else {
            // Text-to-image (якщо не вдалося завантажити оригінал)
            contents = enhancedPrompt;
          }

          const response = await geminiClient.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: contents,
            config: {
              imageConfig: {
                aspectRatio: '1:1', // Instagram квадрат
              },
            },
          });

          // Отримуємо зображення з відповіді
          for (const part of response.parts) {
            if (part.inlineData) {
              // Конвертуємо base64 в Buffer для завантаження в storage
              const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
              // Зберігаємо в тимчасовий файл або завантажуємо безпосередньо в storage
              // Повертаємо base64 data URL, який буде оброблений в storageService
              const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
              imageUrls.push(dataUrl);
            }
          }

          // Затримка між запитами
          if (i < n - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Для другого варіанту трохи змінюємо промпт
            enhancedPrompt += ' Different angle, alternative composition, slightly different styling and perspective.';
          }
        } catch (error) {
          console.error(`Error generating image ${i + 1} with Gemini:`, error);
          // Продовжуємо з наступним варіантом
        }
      }

      if (imageUrls.length === 0) {
        throw new Error('No images generated');
      }

      return imageUrls;
    } catch (error) {
      console.error('Error generating image with Gemini:', error);
      // Fallback до DALL-E 3
      console.log('Falling back to DALL-E 3');
      return this.generateImageWithDALLE(prompt, style, customWishes, n);
    }
  }

  /**
   * Генерує зображення через DALL-E 3
   * @param {string} prompt - Опис зображення
   * @param {string} style - Стиль генерації
   * @param {string} customWishes - Додаткові побажання
   * @param {number} n - Кількість варіантів
   * @returns {Promise<Array<string>>} Масив URL зображень
   */
  async generateImageWithDALLE(prompt, style = null, customWishes = null, n = 2) {
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
      enhancedPrompt += ' Absolutely photorealistic, hyper-realistic, looks like real professional photography, no illustration style, no cartoon, no digital art, no AI-generated look, real camera photo quality.';

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

