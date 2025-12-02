import { Markup } from 'telegraf';

/**
 * Головне меню (Inline Keyboard - для редагування повідомлень)
 */
export const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: '✨ Створити креатив', callback_data: 'start_generation' }],
    [{ text: '🍰 Каталог ідей / Стилі', callback_data: 'styles_menu' }],
    [{ text: '👤 Мій профіль / Баланс', callback_data: 'my_account_menu' }],
    [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '❓ Допомога', callback_data: 'help' }]
  ],
};

/**
 * Головне меню (Reply Keyboard - постійна клавіатура знизу)
 */
const mainMenuReplyKeyboardObj = Markup.keyboard([
  ['✨ Створити креатив'],
  ['🍰 Каталог ідей / Стилі', '👤 Мій профіль / Баланс'],
  ['ℹ️ Про бота', '❓ Допомога']
]).resize().persistent(); // resize() робить кнопки компактнішими, persistent() робить клавіатуру постійною

// Експортуємо reply_markup для використання в ctx.reply()
export const mainMenuReplyKeyboardMarkup = mainMenuReplyKeyboardObj.reply_markup;

/**
 * Клавіатура вибору стилю (Reply Keyboard)
 */
export const styleSelectionReplyKeyboard = Markup.keyboard([
  ['🍓 Яскравий та соковитий', '🧁 Преміум-кондитерська'],
  ['☕ Затишна кав\'ярня', '🎂 Весільна естетика'],
  ['🛠️ Кастомні налаштування'],
  ['🔙 Скасувати']
]).resize().oneTime();

export const styleSelectionReplyKeyboardMarkup = styleSelectionReplyKeyboard.reply_markup;

/**
 * Клавіатура вибору локації/фону (Reply Keyboard)
 */
export const locationSelectionReplyKeyboard = Markup.keyboard([
  ['🏠 Домашня кухня', '☕ Кав\'ярня'],
  ['🍽️ Ресторан', '🏪 Вітрина магазину'],
  ['📸 Студія', '🌳 Природа/Вулиця'],
  ['🎂 Святковий стіл', '➖ Без локації'],
  ['🔙 Назад до стилів']
]).resize().oneTime();

export const locationSelectionReplyKeyboardMarkup = locationSelectionReplyKeyboard.reply_markup;

/**
 * Клавіатура вибору типу контенту (фото/відео) - Reply Keyboard
 */
export const contentTypeSelectionReplyKeyboard = Markup.keyboard([
  ['🖼️ 2 Фото-креативи', '🎬 5-сек Відео'],
  ['🔙 Змінити стиль']
]).resize().oneTime();

export const contentTypeSelectionReplyKeyboardMarkup = contentTypeSelectionReplyKeyboard.reply_markup;

/**
 * Клавіатура вибору анімації для відео (Reply Keyboard)
 */
export const animationSelectionReplyKeyboard = Markup.keyboard([
  ['🔄 Обертання 360°', '🔍 Zoom In'],
  ['🔎 Zoom Out', '↔️ Pan'],
  ['↕️ Tilt', '✨ Без анімації'],
  ['🔙 Назад']
]).resize().oneTime();

export const animationSelectionReplyKeyboardMarkup = animationSelectionReplyKeyboard.reply_markup;

/**
 * Клавіатура після генерації (Reply Keyboard - тільки головне меню)
 */
export const postGenerationReplyKeyboard = Markup.keyboard([
  ['🏠 Головне меню']
]).resize().oneTime();

export const postGenerationReplyKeyboardMarkup = postGenerationReplyKeyboard.reply_markup;

/**
 * Клавіатура для оплати (inline кнопка для URL + Reply Keyboard для головного меню)
 */
export const createPaymentKeyboard = (checkoutUrl) => {
  return Markup.inlineKeyboard([
    [Markup.button.url('💳 Оплатити', checkoutUrl)]
  ]);
};

/**
 * Клавіатура "Назад"
 */
export const backKeyboard = {
  inline_keyboard: [
    [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура стилів/пресетів (оптимізована - кнопка генерації на початку)
 */
export const stylesMenuKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Хочу згенерувати своє фото', callback_data: 'start_generation' }],
    [{ text: '🍰 Торти', callback_data: 'category_cakes' }, { text: '🧁 Капкейки', callback_data: 'category_cupcakes' }],
    [{ text: '🍩 Пончики', callback_data: 'category_donuts' }, { text: '☕ Напої', callback_data: 'category_drinks' }],
    [{ text: '🍪 Печиво', callback_data: 'category_cookies' }, { text: '🍮 Інші десерти', callback_data: 'category_desserts' }],
    [{ text: '🔙 Головне меню', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура для категорії стилю
 */
export const categoryKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Хочу згенерувати своє фото', callback_data: 'generate_own' }],
    [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура налаштувань (застаріла - використовується myAccountMenuKeyboard)
 * @deprecated Використовуйте myAccountMenuKeyboard
 */
export const settingsKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Мої креативи', callback_data: 'my_creatives' }],
    [{ text: '📝 Зворотний зв\'язок', callback_data: 'feedback' }],
    [{ text: '🧩 Мова інтерфейсу: Українська', callback_data: 'language' }],
    [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура профілю/балансу (оптимізована)
 * @param {number} availableGenerations - Доступна кількість генерацій
 */
export const myAccountMenuKeyboard = (availableGenerations = 0) => {
  return {
    inline_keyboard: [
      [{ text: `💰 Мій Баланс: ${availableGenerations} генерацій`, callback_data: 'show_balance' }],
      [{ text: '💳 Поповнити баланс', callback_data: 'buy_generations' }],
      [{ text: '🖼️ Мої креативи', callback_data: 'my_creatives' }],
      [{ text: '📝 Зворотний зв\'язок', callback_data: 'feedback' }, { text: '🧩 Мова: Українська', callback_data: 'language' }],
      [{ text: '🔙 Головне меню', callback_data: 'back_to_menu' }]
    ],
  };
};

/**
 * Клавіатура для креативів (тільки на останньому)
 */
export const creativeKeyboard = {
  inline_keyboard: [
    [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
  ],
};

