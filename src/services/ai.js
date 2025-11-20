import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';
import { config } from '../config.js';

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
  console.log('⚠️  Warning: Gemini API key not set. Image generation will not work.');
}

export class AIService {
  /**
   * Генерує зображення на основі промпту та стилю
   * @param {string} prompt - Опис зображення
   * @param {string} style - Стиль генерації (bright, premium, cozy, wedding, custom)
   * @param {string} customWishes - Додаткові побажання користувача (опціонально)
   * @param {number} n - Кількість варіантів (1-2)
   * @param {string} originalImageUrl - URL оригінального зображення (для image-to-image редагування через Gemini)
   * @param {string} location - Локація/фон для зображення (home, cafe, restaurant, shop, studio, outdoor, celebration, none)
   * @returns {Promise<Array<string>>} Масив URL зображень
   */
  async generateImage(prompt, style = null, customWishes = null, n = 2, originalImageUrl = null, location = null) {
    // Використовуємо тільки Gemini для генерації зображень
    if (!geminiClient) {
      throw new Error('Gemini client not initialized. Please set GEMINI_API_KEY environment variable.');
    }
    
    console.log('🎨 Using Gemini 2.5 Flash Image (Nano Banana) for image generation');
    return await this.generateImageWithGemini(prompt, style, customWishes, n, originalImageUrl, location);
  }

  /**
   * Генерує зображення через Gemini 2.5 Flash Image (Nano Banana) з image-to-image редагуванням
   * @param {string} prompt - Опис зображення
   * @param {string} style - Стиль генерації
   * @param {string} customWishes - Додаткові побажання
   * @param {number} n - Кількість варіантів
   * @param {string} originalImageUrl - URL оригінального зображення
   * @param {string} location - Локація/фон для зображення
   * @returns {Promise<Array<string>>} Масив URL зображень
   */
  async generateImageWithGemini(prompt, style = null, customWishes = null, n = 2, originalImageUrl = null, location = null) {
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

      // Додаємо опис локації/фону
      const locationPrompts = {
        home: 'Set in a cozy home kitchen environment, natural home lighting, domestic atmosphere, warm and inviting background, home-style presentation.',
        cafe: 'Set in a cozy cafe environment, cafe interior background, warm cafe lighting, coffee shop atmosphere, rustic cafe setting.',
        restaurant: 'Set in an elegant restaurant environment, fine dining restaurant background, sophisticated restaurant lighting, upscale restaurant atmosphere.',
        shop: 'Set in a bakery or pastry shop display window, shop window background, commercial display lighting, retail shop atmosphere, professional shop presentation.',
        studio: 'Set in a professional photography studio, clean studio background, professional studio lighting, minimalist studio setting, high-end studio photography.',
        outdoor: 'Set in an outdoor natural environment, natural outdoor lighting, outdoor background, fresh outdoor atmosphere, natural setting.',
        celebration: 'Set in a festive celebration environment, party or celebration background, festive lighting, celebration atmosphere, special occasion setting.',
        none: ''
      };

      if (location && locationPrompts[location]) {
        enhancedPrompt += ' ' + locationPrompts[location];
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

          // Вказуємо, що ми хочемо отримати зображення
          const response = await geminiClient.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: contents,
            config: {
              responseModalities: ['IMAGE'], // Явно вказуємо, що хочемо зображення
              imageConfig: {
                aspectRatio: '1:1', // Instagram квадрат
              },
            },
          });

          // Логуємо структуру відповіді для діагностики
          console.log('[Gemini] Response structure:', {
            hasParts: !!response.parts,
            hasCandidates: !!response.candidates,
            responseKeys: Object.keys(response || {}),
          });

          // Отримуємо зображення з відповіді
          // Структура може бути: response.parts або response.candidates[0].content.parts
          let parts = null;
          
          if (response.parts && Array.isArray(response.parts)) {
            parts = response.parts;
          } else if (response.candidates && response.candidates[0] && response.candidates[0].content) {
            parts = response.candidates[0].content.parts;
          } else if (response.candidates && response.candidates[0] && response.candidates[0].parts) {
            parts = response.candidates[0].parts;
          } else {
            console.error('[Gemini] Unexpected response structure:', JSON.stringify(response, null, 2));
            throw new Error('Unexpected response structure from Gemini API');
          }

          if (!parts || !Array.isArray(parts)) {
            console.error('[Gemini] Parts is not an array:', parts);
            throw new Error('No parts found in Gemini response');
          }

          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              // Конвертуємо base64 в data URL для збереження в storage
              const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
              imageUrls.push(dataUrl);
              console.log('[Gemini] Successfully received image data');
            } else if (part.text) {
              console.log('[Gemini] Received text instead of image:', part.text);
              // Якщо отримали текст, це означає, що Gemini не згенерував зображення
              // Можливо, потрібно використати інший підхід або fallback
            } else {
              console.log('[Gemini] Unexpected part structure:', Object.keys(part || {}));
            }
          }
          
          // Якщо не отримали зображення в цій ітерації, логуємо це
          if (imageUrls.length === i) {
            console.warn(`[Gemini] No image generated in iteration ${i + 1}`);
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
      throw new Error('Не вдалося згенерувати зображення через Gemini. Спробуйте ще раз.');
    }
  }


  /**
   * Генерує підпис до посту українською
   * @param {string} prompt - Опис виробу
   * @param {string} imageDescription - Опис зображення (опціонально)
   * @returns {Promise<string>} Підпис до посту
   */
  async generateCaption(prompt, imageDescription = '') {
    if (!geminiClient) {
      throw new Error('Gemini client not initialized. Please set GEMINI_API_KEY environment variable.');
    }

    return await this.generateCaptionWithGemini(prompt, imageDescription);
  }

  /**
   * Генерує підпис до посту через Gemini
   * @param {string} prompt - Опис виробу
   * @param {string} imageDescription - Опис зображення (опціонально)
   * @returns {Promise<string>} Підпис до посту
   */
  async generateCaptionWithGemini(prompt, imageDescription = '') {
    try {
      if (!geminiClient) {
        throw new Error('Gemini client not initialized');
      }

      const systemInstruction = `Ти експерт з маркетингу для пекарень та кав'ярень. 
Створюй короткі, привабливі підписи до постів в Instagram українською мовою.
Використовуй емодзі, хештеги та створюй атмосферу затишку та апетиту.
Підпис має бути 1-2 речення, максимум 200 символів.`;

      const userPrompt = `Створи підпис до Instagram-посту для такого виробу: ${prompt}
${imageDescription ? `\nОпис зображення: ${imageDescription}` : ''}

Підпис має бути українською мовою, з емодзі та релевантними хештегами.`;

      // Формуємо повний промпт з інструкцією
      const fullPrompt = `${systemInstruction}\n\n${userPrompt}`;

      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.0-flash-exp', // Використовуємо текстову модель Gemini
        contents: fullPrompt, // Можна передати просто текст
        config: {
          temperature: 0.8,
          maxOutputTokens: 200,
        },
      });

      // Отримуємо текст з відповіді
      let text = '';
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        const parts = response.candidates[0].content.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              text += part.text;
            }
          }
        }
      } else if (response.text) {
        text = response.text;
      }

      return text.trim() || `Смачний виріб від нашої пекарні! 🍰✨ #пекарня #десерт #солодкещастя`;
    } catch (error) {
      console.error('Error generating caption with Gemini:', error);
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
    if (!geminiClient) {
      throw new Error('Gemini client not initialized. Please set GEMINI_API_KEY environment variable.');
    }

    return await this.analyzeImageWithGemini(imageUrl);
  }

  /**
   * Аналізує завантажене фото через Gemini
   * @param {string} imageUrl - URL зображення
   * @returns {Promise<string>} Опис зображення
   */
  async analyzeImageWithGemini(imageUrl) {
    try {
      if (!geminiClient) {
        throw new Error('Gemini client not initialized');
      }

      // Завантажуємо зображення
      let imageData = null;
      try {
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        imageData = Buffer.from(imageBuffer).toString('base64');
      } catch (error) {
        console.error('Error loading image for Gemini analysis:', error);
        throw error;
      }

      const prompt = 'Опиши це зображення детально українською мовою. Що на фото? Які кольори, текстури, стиль? Це для генерації Instagram-посту для пекарні.';

      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.0-flash-exp', // Використовуємо текстову модель Gemini з підтримкою зображень
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageData,
                },
              },
            ],
          },
        ],
        config: {
          maxOutputTokens: 300,
        },
      });

      // Отримуємо текст з відповіді
      let text = '';
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        const parts = response.candidates[0].content.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              text += part.text;
            }
          }
        }
      } else if (response.text) {
        text = response.text;
      }

      return text.trim() || 'Фото виробу для Instagram-посту';
    } catch (error) {
      console.error('Error analyzing image with Gemini:', error);
      // Fallback опис
      return 'Фото виробу для Instagram-посту';
    }
  }


  /**
   * Генерує відео на основі зображення та промпту через Veo 3.1
   * @param {string} imageUrl - URL зображення для image-to-video генерації
   * @param {string} prompt - Текстовий опис для відео
   * @param {string} style - Стиль генерації
   * @param {string} location - Локація/фон
   * @param {number} duration - Тривалість відео в секундах (4, 6, або 8)
   * @returns {Promise<Buffer>} Buffer з відео даними
   */
  async generateVideo(imageUrl, prompt, style = null, location = null, duration = 6) {
    try {
      if (!geminiClient) {
        throw new Error('Gemini client not initialized');
      }

      console.log('🎬 Using Veo 3.1 for video generation');

      // Формуємо промпт для відео
      let videoPrompt = prompt;
      
      // Додаємо стильові характеристики
      const stylePrompts = {
        bright: 'vibrant, juicy colors, fresh and appetizing look, bright natural daylight, colorful realistic background, energetic and lively atmosphere.',
        premium: 'luxury realistic pastry shop aesthetic, elegant photorealistic presentation, sophisticated natural styling, premium quality look, refined natural composition, high-end bakery atmosphere.',
        cozy: 'cozy realistic cafe atmosphere, warm and inviting natural lighting, rustic or vintage realistic style, comfortable and homely feeling, warm natural color palette.',
        wedding: 'wedding cake realistic aesthetic, elegant and romantic photorealistic style, soft natural pastel colors, delicate realistic decorations, sophisticated and refined natural appearance.',
        custom: ''
      };

      if (style && stylePrompts[style]) {
        videoPrompt += ' ' + stylePrompts[style];
      }

      // Додаємо опис локації/фону
      const locationPrompts = {
        home: 'Set in a cozy home kitchen environment, natural home lighting, domestic atmosphere, warm and inviting background, home-style presentation.',
        cafe: 'Set in a cozy cafe environment, cafe interior background, warm cafe lighting, coffee shop atmosphere, rustic cafe setting.',
        restaurant: 'Set in an elegant restaurant environment, fine dining restaurant background, sophisticated restaurant lighting, upscale restaurant atmosphere.',
        shop: 'Set in a bakery or pastry shop display window, shop window background, commercial display lighting, retail shop atmosphere, professional shop presentation.',
        studio: 'Set in a professional photography studio, clean studio background, professional studio lighting, minimalist studio setting, high-end studio photography.',
        outdoor: 'Set in an outdoor natural environment, natural outdoor lighting, outdoor background, fresh outdoor atmosphere, natural setting.',
        celebration: 'Set in a festive celebration environment, party or celebration background, festive lighting, celebration atmosphere, special occasion setting.',
        none: ''
      };

      if (location && locationPrompts[location]) {
        videoPrompt += ' ' + locationPrompts[location];
      }

      videoPrompt += ' Absolutely photorealistic, hyper-realistic, looks like real professional video, smooth camera movement, cinematic quality, perfect for Instagram Reels, vertical format 9:16.';

      // Обмежуємо duration до дозволених значень (4, 6, 8)
      // Для Reels використовуємо 5 секунд, але Veo підтримує тільки 4, 6, 8
      const validDuration = duration <= 4 ? 4 : duration <= 6 ? 6 : 8;

      // Генеруємо відео через Veo 3.1 Fast (швидша версія)
      // Згідно з документацією, для image-to-video потрібно передати об'єкт з imageBytes та mimeType
      // Завантажуємо зображення
      console.log(`[Veo] Loading image from URL: ${imageUrl}`);
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageData = Buffer.from(imageBuffer);
      
      // Конвертуємо Buffer в base64 рядок для imageBytes
      // Помилка каже "fromImageBytes must be a string", тому потрібен base64 рядок
      const imageBytes = imageData.toString('base64');
      
      console.log(`[Veo] Created imageBytes (base64 string) with size: ${imageBytes.length} chars`);
      
      // Створюємо об'єкт у форматі, який очікує Veo API
      // Згідно з документацією та помилкою: { imageBytes: string (base64), mimeType: string }
      const imageObject = {
        imageBytes: imageBytes,
        mimeType: 'image/jpeg',
      };
      
      // Генеруємо відео з об'єктом зображення
      let operation = await geminiClient.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt,
        image: imageObject, // Передаємо об'єкт з imageBytes та mimeType
        duration: validDuration,
      });

      console.log(`[Veo] Video generation started, operation: ${operation.name}`);

      // Поллімо статус операції (за документацією - кожні 10 секунд)
      let pollCount = 0;
      const maxPolls = 60; // Максимум 10 хвилин (60 * 10 секунд)
      
      while (!operation.done && pollCount < maxPolls) {
        console.log(`[Veo] Polling status... (${pollCount + 1}/${maxPolls})`);
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Чекаємо 10 секунд
        
        operation = await geminiClient.operations.getVideosOperation({
          operation: operation,
        });
        
        pollCount++;
      }

      if (!operation.done) {
        throw new Error('Video generation timeout - operation took too long');
      }

      if (operation.error) {
        throw new Error(`Video generation failed: ${operation.error.message || 'Unknown error'}`);
      }

      // Отримуємо згенероване відео
      const generatedVideo = operation.response.generatedVideos[0];
      if (!generatedVideo || !generatedVideo.video) {
        throw new Error('No video generated in response');
      }

      console.log(`[Veo] Video generated successfully, URI: ${generatedVideo.video.uri}`);

      // Завантажуємо відео
      // Згідно з документацією, files.download() може повертати дані в різних форматах
      const videoData = await geminiClient.files.download({
        file: generatedVideo.video,
      });

      console.log(`[Veo] Video data type: ${typeof videoData}, is Buffer: ${Buffer.isBuffer(videoData)}`);

      // Конвертуємо в Buffer
      let videoBuffer;
      if (Buffer.isBuffer(videoData)) {
        videoBuffer = videoData;
      } else if (videoData instanceof ArrayBuffer) {
        videoBuffer = Buffer.from(videoData);
      } else if (videoData instanceof Uint8Array) {
        videoBuffer = Buffer.from(videoData);
      } else if (typeof videoData === 'string') {
        // Якщо це base64 рядок
        videoBuffer = Buffer.from(videoData, 'base64');
      } else if (videoData && videoData.buffer) {
        // Якщо це об'єкт з buffer властивістю
        videoBuffer = Buffer.from(videoData.buffer);
      } else if (videoData && videoData.data) {
        // Якщо дані в data властивості
        videoBuffer = Buffer.from(videoData.data);
      } else {
        // Якщо дані не отримані, спробуємо завантажити з URI напряму
        console.log(`[Veo] Video data is undefined or unexpected format, trying to download from URI directly`);
        const videoResponse = await fetch(generatedVideo.video.uri, {
          headers: {
            'x-goog-api-key': config.gemini.apiKey,
          },
        });
        const videoArrayBuffer = await videoResponse.arrayBuffer();
        videoBuffer = Buffer.from(videoArrayBuffer);
      }

      console.log(`[Veo] Video buffer created, size: ${videoBuffer.length} bytes`);

      return videoBuffer;

    } catch (error) {
      console.error('Error generating video with Veo:', error);
      
      // Повертаємо зрозуміле повідомлення про помилку
      if (error.message.includes('quota') || error.message.includes('429')) {
        throw new Error('Досягнуто ліміт генерації відео. Спробуй пізніше.');
      } else if (error.message.includes('safety')) {
        throw new Error('Відео не може бути згенероване через обмеження безпеки.');
      } else {
        throw new Error(`Помилка генерації відео: ${error.message}`);
      }
    }
  }
}

export const aiService = new AIService();

