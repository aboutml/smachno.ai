import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
  },
  gemini: {
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
  },
  ai: {
    imageModel: process.env.IMAGE_MODEL || 'gemini-2.5-flash-image', // Використовуємо тільки Gemini
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  payment: {
    wayForPayMerchantAccount: process.env.WAYFORPAY_MERCHANT_ACCOUNT,
    wayForPaySecretKey: process.env.WAYFORPAY_SECRET_KEY,
    wayForPayMerchantPassword: process.env.WAYFORPAY_MERCHANT_PASSWORD, // Альтернатива для деяких операцій
    merchantDomainName: process.env.MERCHANT_DOMAIN_NAME || 'your-domain.com',
    amount: parseInt(process.env.PAYMENT_AMOUNT || '30'),
    currency: process.env.PAYMENT_CURRENCY || 'UAH',
  },
  admin: {
    userIds: (process.env.ADMIN_USER_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)),
    feedbackUsername: process.env.ADMIN_FEEDBACK_USERNAME || null, // Username для отримання зворотного зв'язку (опціонально)
    feedbackUserId: process.env.ADMIN_FEEDBACK_USER_ID ? parseInt(process.env.ADMIN_FEEDBACK_USER_ID) : null, // Telegram ID для отримання зворотного зв'язку (опціонально)
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000'),
    freeGenerations: 2, // Кількість безкоштовних генерацій
    paidGenerationsPerPayment: 1, // Кількість генерацій за одну оплату (1 генерація = 2 варіанти зображень)
  },
};

// Валідація конфігурації
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️  Warning: ${envVar} is not set`);
  }
}

// Валідація OpenAI API ключа
if (config.openai.apiKey) {
  // Перевіряємо, чи немає зайвих символів (переноси рядків, пробіли)
  const cleanedKey = config.openai.apiKey.replace(/\s+/g, '');
  if (cleanedKey !== config.openai.apiKey) {
    console.warn('⚠️  Warning: OPENAI_API_KEY contains whitespace characters, cleaning...');
    config.openai.apiKey = cleanedKey;
  }
  
  // Перевіряємо формат ключа (має починатися з sk-)
  if (!config.openai.apiKey.startsWith('sk-')) {
    console.warn('⚠️  Warning: OPENAI_API_KEY does not start with "sk-", may be invalid');
  }
  
  // Перевіряємо довжину (мінімум 20 символів)
  if (config.openai.apiKey.length < 20) {
    console.warn('⚠️  Warning: OPENAI_API_KEY seems too short, may be invalid');
  }
} else {
  console.error('❌ Error: OPENAI_API_KEY is not set or empty');
}

