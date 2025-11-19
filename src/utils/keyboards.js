import { Markup } from 'telegraf';

/**
 * Головне меню
 */
export const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Згенерувати фото десерту', callback_data: 'generate_photo' }],
    [{ text: '💡 Стилі / Пресети', callback_data: 'styles_menu' }],
    [{ text: 'ℹ️ Про бота', callback_data: 'about' }, { text: '⚙️ Налаштування', callback_data: 'settings' }],
    [{ text: '❓ Допомога', callback_data: 'help' }]
  ],
};

/**
 * Клавіатура вибору стилю
 */
export const styleSelectionKeyboard = {
  inline_keyboard: [
    [{ text: '🍓 Яскравий та соковитий', callback_data: 'style_bright' }],
    [{ text: '🧁 Преміум-кондитерська', callback_data: 'style_premium' }],
    [{ text: '☕ Затишна кав\'ярня', callback_data: 'style_cozy' }],
    [{ text: '🎂 Весільна естетика', callback_data: 'style_wedding' }],
    [{ text: '➕ Додати свої побажання', callback_data: 'style_custom' }],
    [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура після генерації
 */
export const postGenerationKeyboard = {
  inline_keyboard: [
    [{ text: '🔄 Згенерувати ще раз (те саме фото)', callback_data: 'regenerate_same' }],
    [{ text: '✨ Змінити стиль', callback_data: 'change_style' }],
    [{ text: '🖼 Спробувати інше фото', callback_data: 'new_photo' }],
    [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
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
 * Клавіатура стилів/пресетів
 */
export const stylesMenuKeyboard = {
  inline_keyboard: [
    [{ text: '🍰 Торти', callback_data: 'style_cakes' }],
    [{ text: '🧁 Капкейки', callback_data: 'style_cupcakes' }],
    [{ text: '🍩 Пончики', callback_data: 'style_donuts' }],
    [{ text: '☕ Напої', callback_data: 'style_drinks' }],
    [{ text: '🍪 Печиво', callback_data: 'style_cookies' }],
    [{ text: '🍮 Десерти', callback_data: 'style_desserts' }],
    [{ text: '📸 Хочу згенерувати своє фото', callback_data: 'generate_own' }],
    [{ text: '🔙 Назад', callback_data: 'back_to_menu' }]
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
 * Клавіатура налаштувань
 */
export const settingsKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Мої креативи', callback_data: 'my_creatives' }],
    [{ text: '🧩 Мова інтерфейсу: Українська', callback_data: 'language' }],
    [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
  ],
};

/**
 * Клавіатура для креативів (тільки на останньому)
 */
export const creativeKeyboard = {
  inline_keyboard: [
    [{ text: '🏠 Головне меню', callback_data: 'back_to_menu' }]
  ],
};

