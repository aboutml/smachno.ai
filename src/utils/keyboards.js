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
export const mainMenuReplyKeyboard = Markup.keyboard([
  ['✨ Створити креатив'],
  ['🍰 Каталог ідей / Стилі', '👤 Мій профіль / Баланс'],
  ['ℹ️ Про бота', '❓ Допомога']
]).resize(); // resize() робить кнопки компактнішими

/**
 * Клавіатура вибору стилю (оптимізована - 2 колонки)
 */
export const styleSelectionKeyboard = {
  inline_keyboard: [
    [{ text: '🍓 Яскравий та соковитий', callback_data: 'style_bright_next' }, { text: '🧁 Преміум-кондитерська', callback_data: 'style_premium_next' }],
    [{ text: '☕ Затишна кав\'ярня', callback_data: 'style_cozy_next' }, { text: '🎂 Весільна естетика', callback_data: 'style_wedding_next' }],
    [{ text: '🛠️ Кастомні налаштування', callback_data: 'style_custom' }],
    [{ text: '🔙 Скасувати', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура вибору локації/фону
 */
export const locationSelectionKeyboard = {
  inline_keyboard: [
    [{ text: '🏠 Домашня кухня', callback_data: 'location_home' }],
    [{ text: '☕ Кав\'ярня', callback_data: 'location_cafe' }],
    [{ text: '🍽️ Ресторан', callback_data: 'location_restaurant' }],
    [{ text: '🏪 Вітрина магазину', callback_data: 'location_shop' }],
    [{ text: '📸 Студія', callback_data: 'location_studio' }],
    [{ text: '🌳 Природа/Вулиця', callback_data: 'location_outdoor' }],
    [{ text: '🎂 Святковий стіл', callback_data: 'location_celebration' }],
    [{ text: '➖ Без локації', callback_data: 'location_none' }],
    [{ text: '🔙 Назад до стилів', callback_data: 'back_to_styles' }]
  ],
};

/**
 * Клавіатура вибору типу контенту (фото/відео) - оптимізована
 */
export const contentTypeSelectionKeyboard = {
  inline_keyboard: [
    [{ text: '🖼️ 2 Фото-креативи (Базовий)', callback_data: 'content_photo' }],
    [{ text: '🎬 5-сек Відео (Reels/TikTok)', callback_data: 'content_kling_next' }],
    [{ text: '🔙 Змінити стиль', callback_data: 'back_to_styles' }]
  ],
};

/**
 * Клавіатура вибору анімації для відео
 */
export const animationSelectionKeyboard = {
  inline_keyboard: [
    [{ text: '🔄 Обертання 360°', callback_data: 'animation_rotate' }],
    [{ text: '🔍 Zoom In (наближення)', callback_data: 'animation_zoom_in' }],
    [{ text: '🔎 Zoom Out (віддалення)', callback_data: 'animation_zoom_out' }],
    [{ text: '↔️ Pan (рух вліво-вправо)', callback_data: 'animation_pan' }],
    [{ text: '↕️ Tilt (рух вгору-вниз)', callback_data: 'animation_tilt' }],
    [{ text: '✨ Без анімації', callback_data: 'animation_none' }],
    [{ text: '🔙 Назад', callback_data: 'back_to_content_type' }]
  ],
};

/**
 * Клавіатура після генерації (спрощена - тільки головне меню)
 */
export const postGenerationKeyboard = {
  inline_keyboard: [
    [{ text: '🏠 Головне меню', callback_data: 'back_to_menu_simple' }]
  ],
};

/**
 * Клавіатура для оплати
 */
export const createPaymentKeyboard = (checkoutUrl) => {
  return Markup.inlineKeyboard([
    [Markup.button.url('💳 Оплатити', checkoutUrl)],
    [Markup.button.callback('🏠 Головне меню', 'back_to_menu')]
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

