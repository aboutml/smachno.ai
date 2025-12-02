import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import { config } from '../config.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import jwt from 'jsonwebtoken';

const execAsync = promisify(exec);

// Ініціалізуємо OpenAI для TTS
let openaiClient = null;
if (config.openai.apiKey) {
  try {
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    console.log('✅ OpenAI client initialized successfully for TTS');
  } catch (error) {
    console.warn('⚠️  Warning: Failed to initialize OpenAI client for TTS:', error.message);
  }
}

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
      let enhancedPrompt = `Transform this food photography into a highly realistic, professional Instagram/TikTok-quality image: ${prompt}. 
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
            model: 'gemini-3-pro-image-preview',
            contents: contents,
            config: {
              responseModalities: ['IMAGE'], // Явно вказуємо, що хочемо зображення
              imageConfig: {
                aspectRatio: '1:1', // Instagram/TikTok квадрат
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
Створюй короткі, привабливі підписи до постів в Instagram/TikTok українською мовою.
Використовуй емодзі, хештеги та створюй атмосферу затишку та апетиту.
Підпис має бути 1-2 речення, максимум 200 символів.`;

      const userPrompt = `Створи підпис до Instagram/TikTok-посту для такого виробу: ${prompt}
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

      const prompt = 'Опиши це зображення детально українською мовою. Що на фото? Які кольори, текстури, стиль? Це для генерації Instagram/TikTok-посту для пекарні.';

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

      return text.trim() || 'Фото виробу для Instagram/TikTok-посту';
    } catch (error) {
      console.error('Error analyzing image with Gemini:', error);
      // Fallback опис
      return 'Фото виробу для Instagram/TikTok-посту';
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
  async generateVideo(imageUrl, prompt, style = null, location = null, duration = 6, animation = null) {
    try {
      if (!geminiClient) {
        throw new Error('Gemini client not initialized');
      }

      console.log('🎬 Using Veo 3.1 for video generation');

      // Формуємо промпт для відео
      // ВАЖЛИВО: Не можна змінювати сам десерт, тільки яскравість, насиченість, кольори та фон
      let videoPrompt = `Keep the dessert exactly as it is - do not modify, change, or alter the dessert itself. Only adjust lighting, brightness, color saturation, and background. ${prompt}`;
      
      // Додаємо стильові характеристики (тільки для яскравості, насиченості та кольорів)
      const stylePrompts = {
        bright: 'Enhance brightness and color saturation, vibrant and fresh color palette, bright natural daylight, colorful realistic background, energetic atmosphere. Keep the dessert unchanged.',
        premium: 'Sophisticated lighting adjustments, refined color grading, premium quality look, elegant natural composition, high-end atmosphere. Keep the dessert unchanged.',
        cozy: 'Warm lighting adjustments, warm color palette, cozy atmosphere, inviting natural lighting, comfortable feeling. Keep the dessert unchanged.',
        wedding: 'Soft lighting adjustments, pastel color grading, elegant and romantic style, delicate atmosphere, refined appearance. Keep the dessert unchanged.',
        custom: 'Keep the dessert unchanged.'
      };

      if (style && stylePrompts[style]) {
        videoPrompt += ' ' + stylePrompts[style];
      }

      // Додаємо опис локації/фону (тільки фон, не десерт)
      const locationPrompts = {
        home: 'Change background to cozy home kitchen environment, natural home lighting, domestic atmosphere, warm and inviting background. Keep the dessert exactly as it is.',
        cafe: 'Change background to cozy cafe environment, cafe interior background, warm cafe lighting, coffee shop atmosphere. Keep the dessert exactly as it is.',
        restaurant: 'Change background to elegant restaurant environment, fine dining restaurant background, sophisticated restaurant lighting. Keep the dessert exactly as it is.',
        shop: 'Change background to bakery or pastry shop display window, shop window background, commercial display lighting. Keep the dessert exactly as it is.',
        studio: 'Change background to professional photography studio, clean studio background, professional studio lighting, minimalist studio setting. Keep the dessert exactly as it is.',
        outdoor: 'Change background to outdoor natural environment, natural outdoor lighting, outdoor background, fresh outdoor atmosphere. Keep the dessert exactly as it is.',
        celebration: 'Change background to festive celebration environment, party or celebration background, festive lighting. Keep the dessert exactly as it is.',
        none: 'Keep the dessert exactly as it is.'
      };

      if (location && locationPrompts[location]) {
        videoPrompt += ' ' + locationPrompts[location];
      }

      // Додаємо інструкції про анімацію
      const animationPrompts = {
        rotate: 'Smooth 360-degree rotation around the dessert, continuous circular camera movement, showcase all angles of the dessert, professional turntable effect.',
        zoom_in: 'Smooth zoom in towards the dessert, gradually getting closer, focus on details, cinematic zoom effect, professional camera movement.',
        zoom_out: 'Smooth zoom out from the dessert, gradually revealing more of the background, cinematic pull-back effect, professional camera movement.',
        pan: 'Smooth horizontal panning movement left to right or right to left, showcase the dessert from side to side, professional camera panning.',
        tilt: 'Smooth vertical tilting movement up and down, showcase the dessert from different vertical angles, professional camera tilting.',
        none: 'Static camera, no movement, stable shot.'
      };

      if (animation && animationPrompts[animation]) {
        videoPrompt += ' ' + animationPrompts[animation];
      }

      videoPrompt += ' Absolutely photorealistic, hyper-realistic, looks like real professional video, smooth camera movement, cinematic quality, perfect for Instagram Reels/TikTok, vertical format 9:16 aspect ratio (1080x1920 pixels or higher resolution). Do not modify the dessert - only adjust lighting, colors, saturation, and background.';

      // Обмежуємо duration до дозволених значень (4, 6, 8)
      // Для Reels використовуємо 6 секунд (найближче до 5 секунд)
      // Veo 3.1 підтримує 720p для 4-6 секунд, 1080p тільки для 8 секунд
      const validDuration = 6; // 6 секунд (найближче до 5 секунд для Reels/TikTok)

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
      // Використовуємо 8 секунд для отримання 1080p роздільності (максимальна якість)
      // Veo 3.1 підтримує 1080p тільки для 8 секунд
      // Для вертикального формату 9:16 (Reels/TikTok) розміри: 1080x1920 пікселів
      let operation = await geminiClient.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt,
        image: imageObject, // Передаємо об'єкт з imageBytes та mimeType
        duration: validDuration, // 8 секунд для 1080p
        aspectRatio: '9:16', // Вертикальний формат для Reels/TikTok (1080x1920)
      });
      
      console.log(`[Veo] Video generation with duration: ${validDuration}s, aspect ratio: 9:16 (1080x1920 pixels)`);

      console.log(`[Veo] Video generation started, operation: ${operation.name}`);

      // Поллімо статус операції (за документацією - кожні 10 секунд)
      let pollCount = 0;
      const maxPolls = 300; // Максимум 50 хвилин (300 * 10 секунд)
      
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

  /**
   * Генерує JWT токен для KlingAI API автентифікації
   * @param {string} accessKey - Access Key
   * @param {string} secretKey - Secret Key
   * @returns {string} JWT токен
   */
  generateKlingAIToken(accessKey, secretKey) {
    const headers = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const payload = {
      iss: accessKey, // issuer = access key
      exp: Math.floor(Date.now() / 1000) + 1800, // expires in 30 minutes (1800 seconds)
      nbf: Math.floor(Date.now() / 1000) - 5 // not before (current time - 5 seconds)
    };

    // Генеруємо JWT токен з використанням secretKey як секрету
    const token = jwt.sign(payload, secretKey, { 
      algorithm: 'HS256',
      header: headers 
    });

    return token;
  }

  async generateVideoWithKlingAI(imageUrl, prompt, style = null, location = null, animation = null) {
    try {
      if (!config.klingai.accessKey || !config.klingai.secretKey) {
        throw new Error('KlingAI Access Key or Secret Key not configured');
      }

      // Генеруємо JWT токен для автентифікації
      const bearerToken = this.generateKlingAIToken(config.klingai.accessKey, config.klingai.secretKey);
      console.log('[KlingAI] Generated JWT token for authentication');

      console.log('🎥 Using KlingAI 1.6 for video generation');

      // Формуємо промпт для відео
      // ВАЖЛИВО: Не можна змінювати сам десерт, тільки яскравість, насиченість, кольори та фон
      let videoPrompt = `Keep the dessert exactly as it is - do not modify, change, or alter the dessert itself. Only adjust lighting, brightness, color saturation, and background. ${prompt}`;
      
      // Додаємо стильові характеристики (тільки для яскравості, насиченості та кольорів)
      const stylePrompts = {
        bright: 'Enhance brightness and color saturation, vibrant and fresh color palette, bright natural daylight, colorful realistic background, energetic atmosphere. Keep the dessert unchanged.',
        premium: 'Sophisticated lighting adjustments, refined color grading, premium quality look, elegant natural composition, high-end atmosphere. Keep the dessert unchanged.',
        cozy: 'Warm lighting adjustments, warm color palette, cozy atmosphere, inviting natural lighting, comfortable feeling. Keep the dessert unchanged.',
        wedding: 'Soft lighting adjustments, pastel color grading, elegant and romantic style, delicate atmosphere, refined appearance. Keep the dessert unchanged.',
        custom: 'Keep the dessert unchanged.'
      };

      if (style && stylePrompts[style]) {
        videoPrompt += ' ' + stylePrompts[style];
      }

      // Додаємо опис локації/фону (тільки фон, не десерт)
      const locationPrompts = {
        home: 'Change background to cozy home kitchen environment, natural home lighting, domestic atmosphere, warm and inviting background. Keep the dessert exactly as it is.',
        cafe: 'Change background to cozy cafe environment, cafe interior background, warm cafe lighting, coffee shop atmosphere. Keep the dessert exactly as it is.',
        restaurant: 'Change background to elegant restaurant environment, fine dining restaurant background, sophisticated restaurant lighting. Keep the dessert exactly as it is.',
        shop: 'Change background to bakery or pastry shop display window, shop window background, commercial display lighting. Keep the dessert exactly as it is.',
        studio: 'Change background to professional photography studio, clean studio background, professional studio lighting, minimalist studio setting. Keep the dessert exactly as it is.',
        outdoor: 'Change background to outdoor natural environment, natural outdoor lighting, outdoor background, fresh outdoor atmosphere. Keep the dessert exactly as it is.',
        celebration: 'Change background to festive celebration environment, party or celebration background, festive lighting. Keep the dessert exactly as it is.',
        none: 'Keep the dessert exactly as it is.'
      };

      if (location && locationPrompts[location]) {
        videoPrompt += ' ' + locationPrompts[location];
      }

      // Додаємо інструкції про анімацію
      const animationPrompts = {
        rotate: 'Smooth 360-degree rotation around the dessert, continuous circular camera movement, showcase all angles of the dessert, professional turntable effect.',
        zoom_in: 'Smooth zoom in towards the dessert, gradually getting closer, focus on details, cinematic zoom effect, professional camera movement.',
        zoom_out: 'Smooth zoom out from the dessert, gradually revealing more of the background, cinematic pull-back effect, professional camera movement.',
        pan: 'Smooth horizontal panning movement left to right or right to left, showcase the dessert from side to side, professional camera panning.',
        tilt: 'Smooth vertical tilting movement up and down, showcase the dessert from different vertical angles, professional camera tilting.',
        none: 'Static camera, no movement, stable shot.'
      };

      if (animation && animationPrompts[animation]) {
        videoPrompt += ' ' + animationPrompts[animation];
      }

      videoPrompt += ' Absolutely photorealistic, hyper-realistic, looks like real professional video, smooth camera movement, cinematic quality, perfect for Instagram Reels/TikTok, vertical format 9:16 aspect ratio (1080x1920 pixels or higher resolution). Do not modify the dessert - only adjust lighting, colors, saturation, and background.';

      // Завантажуємо зображення
      console.log(`[KlingAI] Loading image from URL: ${imageUrl}`);
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageData = Buffer.from(imageBuffer);
      
      // Конвертуємо в base64 для KlingAI API
      const imageBase64 = imageData.toString('base64');
      
      // Формуємо запит до KlingAI API
      // Згідно з документацією: POST /v1/videos/image2video
      // Автентифікація: Authorization: Bearer {apiKey}
      // ВАЖЛИВО: camera_control підтримується тільки в pro mode з 5s duration та kling-v1-5
      const useAnimation = animation && animation !== 'none';
      const modelName = useAnimation ? 'kling-v1-5' : 'kling-v1-6'; // Для анімації використовуємо v1-5
      
      const requestBody = {
        model_name: modelName,
        mode: 'pro', // Professional mode для кращої якості
        duration: '5', // 5 секунд (string format) - обов'язково для camera_control
        image: imageBase64, // Base64 encoded image (без префіксу data:image/png;base64,)
        prompt: videoPrompt,
        cfg_scale: 0.5, // Гнучкість генерації
      };

      // Додаємо camera_control для анімації, якщо вказано
      // Підтримується тільки в pro mode з 5s duration та kling-v1-5
      if (useAnimation) {
        const cameraControl = {
          type: 'simple',
          config: {}
        };

        switch (animation) {
          case 'rotate':
            // Обертання 360° - використовуємо roll
            cameraControl.config.roll = 10;
            break;
          case 'zoom_in':
            // Наближення - негативне значення zoom
            cameraControl.config.zoom = -10;
            break;
          case 'zoom_out':
            // Віддалення - позитивне значення zoom
            cameraControl.config.zoom = 10;
            break;
          case 'pan':
            // Рух вліво-вправо - horizontal
            cameraControl.config.horizontal = 10;
            break;
          case 'tilt':
            // Рух вгору-вниз - vertical
            cameraControl.config.vertical = 10;
            break;
        }

        requestBody.camera_control = cameraControl;
        console.log(`[KlingAI] Using camera_control with model ${modelName} for animation: ${animation}`);
      } else {
        console.log(`[KlingAI] No animation, using model ${modelName}`);
      }

      const endpoint = `${config.klingai.apiUrl}/v1/videos/image2video`;
      console.log(`[KlingAI] Sending request to: ${endpoint}`);

      // Відправляємо запит до KlingAI API
      // Автентифікація через Bearer token (використовуємо apiKey або accessKey)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[KlingAI] API error: ${response.status} - ${errorText}`);
        throw new Error(`KlingAI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[KlingAI] Response received:`, result);

      // Перевіряємо код відповіді (0 = успіх)
      if (result.code !== 0) {
        throw new Error(`KlingAI API error: ${result.message || 'Unknown error'}`);
      }

      // Отримуємо task_id з відповіді
      const taskId = result.data?.task_id;
      if (!taskId) {
        throw new Error('No task_id received from KlingAI API');
      }

      console.log(`[KlingAI] Video generation started, task_id: ${taskId}. Polling for status...`);
      
      // Полімо статус кожні 10 секунд
      let pollCount = 0;
      const maxPolls = 300; // Максимум 50 хвилин (300 * 10 секунд)
      const fetchTimeout = 30000; // 30 секунд таймаут для кожного fetch запиту
      
      while (pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Чекаємо 10 секунд
        
        // Запитуємо статус задачі: GET /v1/videos/image2video/{task_id}
        const statusEndpoint = `${config.klingai.apiUrl}/v1/videos/image2video/${taskId}`;
        console.log(`[KlingAI] Checking status at: ${statusEndpoint} (poll ${pollCount + 1}/${maxPolls})`);
        
        try {
          // Використовуємо AbortController для таймауту fetch запиту
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
          
          const statusResponse = await fetch(statusEndpoint, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${bearerToken}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!statusResponse.ok) {
            console.warn(`[KlingAI] Status check failed (${statusResponse.status}), retrying...`);
            pollCount++;
            continue; // Продовжуємо полінг навіть якщо запит не вдався
          }

          const statusResult = await statusResponse.json();
          
          // Перевіряємо код відповіді
          if (statusResult.code !== 0) {
            console.warn(`[KlingAI] API returned error code ${statusResult.code}: ${statusResult.message || 'Unknown error'}, retrying...`);
            pollCount++;
            continue; // Продовжуємо полінг навіть якщо є помилка
          }

          const taskStatus = statusResult.data?.task_status;
          console.log(`[KlingAI] Task status: ${taskStatus}`);

          // Перевіряємо статус задачі
          if (taskStatus === 'succeed') {
            // Відео готове
            const videos = statusResult.data?.task_result?.videos;
            if (videos && videos.length > 0 && videos[0].url) {
              const videoUrl = videos[0].url;
              console.log(`[KlingAI] Video ready, downloading from: ${videoUrl}`);
              
              // Завантажуємо відео з таймаутом
              const downloadController = new AbortController();
              const downloadTimeoutId = setTimeout(() => downloadController.abort(), 120000); // 2 хвилини для завантаження
              
              try {
                const videoResponse = await fetch(videoUrl, {
                  signal: downloadController.signal,
                });
                clearTimeout(downloadTimeoutId);
                
                if (!videoResponse.ok) {
                  throw new Error(`Failed to download video: ${videoResponse.statusText}`);
                }
                const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
                console.log(`[KlingAI] Video downloaded, size: ${videoBuffer.length} bytes`);
                return videoBuffer;
              } catch (downloadError) {
                clearTimeout(downloadTimeoutId);
                if (downloadError.name === 'AbortError') {
                  throw new Error('Video download timeout - file too large or connection too slow');
                }
                throw downloadError;
              }
            } else {
              throw new Error('Video URL not found in response');
            }
          } else if (taskStatus === 'failed') {
            const errorMsg = statusResult.data?.task_status_msg || 'Unknown error';
            throw new Error(`Video generation failed: ${errorMsg}`);
          } else if (taskStatus === 'submitted' || taskStatus === 'processing') {
            // Продовжуємо полінг
            pollCount++;
            continue;
          } else {
            console.warn(`[KlingAI] Unknown task status: ${taskStatus}, continuing polling...`);
            pollCount++;
            continue; // Продовжуємо полінг навіть для невідомого статусу
          }
        } catch (fetchError) {
          // Обробляємо помилки fetch (таймаут, мережа тощо)
          if (fetchError.name === 'AbortError') {
            console.warn(`[KlingAI] Fetch timeout on poll ${pollCount + 1}, retrying...`);
          } else {
            console.warn(`[KlingAI] Fetch error on poll ${pollCount + 1}: ${fetchError.message}, retrying...`);
          }
          pollCount++;
          continue; // Продовжуємо полінг навіть при помилках мережі
        }
      }

      throw new Error('Video generation timeout - operation took too long');

    } catch (error) {
      console.error('Error generating video with KlingAI:', error);
      
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

  /**
   * Генерує аудіо озвучку через OpenAI TTS
   * @param {string} text - Текст для озвучки
   * @param {string} voice - Голос (alloy, echo, fable, onyx, nova, shimmer)
   * @returns {Promise<Buffer>} Buffer з аудіо даними (MP3)
   */
  async generateAudio(text, voice = 'alloy') {
    try {
      if (!openaiClient) {
        throw new Error('OpenAI client not initialized for TTS');
      }

      console.log(`[TTS] Generating audio for text: "${text.substring(0, 50)}..."`);

      // Генеруємо аудіо через OpenAI TTS
      const response = await openaiClient.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: text,
        speed: 1.0,
      });

      // Конвертуємо stream в Buffer
      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`[TTS] Audio generated, size: ${buffer.length} bytes`);
      
      return buffer;
    } catch (error) {
      console.error('Error generating audio with TTS:', error);
      throw new Error(`Помилка генерації аудіо: ${error.message}`);
    }
  }

  /**
   * Об'єднує відео з аудіо за допомогою ffmpeg
   * @param {Buffer} videoBuffer - Buffer з відео даними
   * @param {Buffer} audioBuffer - Buffer з аудіо даними
   * @returns {Promise<Buffer>} Buffer з об'єднаним відео
   */
  async combineVideoWithAudio(videoBuffer, audioBuffer) {
    // Перевіряємо, чи ffmpeg доступний
    try {
      await execAsync('which ffmpeg');
    } catch (error) {
      console.error('[ffmpeg] ffmpeg not found in PATH. Please install ffmpeg.');
      throw new Error('ffmpeg не встановлено. Відео буде без аудіо.');
    }

    const tempDir = tmpdir();
    const videoPath = join(tempDir, `video_${Date.now()}.mp4`);
    const audioPath = join(tempDir, `audio_${Date.now()}.mp3`);
    const outputPath = join(tempDir, `output_${Date.now()}.mp4`);

    try {
      // Зберігаємо тимчасові файли
      writeFileSync(videoPath, videoBuffer);
      writeFileSync(audioPath, audioBuffer);

      console.log(`[ffmpeg] Combining video with audio...`);

      // Використовуємо ffmpeg для об'єднання
      // -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -shortest output.mp4
      // -shortest обрізає відео/аудіо до найкоротшого
      const { stdout, stderr } = await execAsync(
        `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest -y "${outputPath}"`
      );

      if (stderr && !stderr.includes('Stream mapping') && !stderr.includes('Press [q]')) {
        console.warn('[ffmpeg] stderr:', stderr);
      }

      // Читаємо результат
      const combinedBuffer = readFileSync(outputPath);
      console.log(`[ffmpeg] Video and audio combined, size: ${combinedBuffer.length} bytes`);

      return combinedBuffer;
    } catch (error) {
      console.error('Error combining video with audio:', error);
      throw new Error(`Помилка об'єднання відео з аудіо: ${error.message}`);
    } finally {
      // Видаляємо тимчасові файли
      try {
        if (existsSync(videoPath)) unlinkSync(videoPath);
        if (existsSync(audioPath)) unlinkSync(audioPath);
        if (existsSync(outputPath)) unlinkSync(outputPath);
      } catch (cleanupError) {
        console.warn('[ffmpeg] Warning: Failed to cleanup temp files:', cleanupError);
      }
    }
  }
}

export const aiService = new AIService();
