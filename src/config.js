import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  payment: {
    wayForPayMerchantAccount: process.env.WAYFORPAY_MERCHANT_ACCOUNT,
    wayForPaySecretKey: process.env.WAYFORPAY_SECRET_KEY,
    merchantDomainName: process.env.MERCHANT_DOMAIN_NAME || 'your-domain.com',
    amount: parseInt(process.env.PAYMENT_AMOUNT || '30'),
    currency: process.env.PAYMENT_CURRENCY || 'UAH',
  },
  admin: {
    userIds: (process.env.ADMIN_USER_IDS || '').split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)),
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000'),
    freeGenerations: 2, // Кількість безкоштовних генерацій
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

