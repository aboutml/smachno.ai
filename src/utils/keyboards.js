import { Markup } from 'telegraf';

/**
 * Головне меню
 */
export const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Згенерувати креатив десерту', callback_data: 'generate_photo' }],
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
 * Клавіатура вибору типу контенту (фото/відео)
 */
export const contentTypeSelectionKeyboard = {
  inline_keyboard: [
    [{ text: '📸 Фото (2 варіанти)', callback_data: 'content_photo' }],
    [{ text: '🎬 Відео для Reels/TikTok (5 сек, з аудіо)', callback_data: 'content_video' }],
    [{ text: '🎥 Відео через KlingAI 1.6', callback_data: 'content_kling' }],
    [{ text: '🔙 Назад до локації', callback_data: 'back_to_location' }]
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
    [{ text: '📝 Зворотний зв\'язок', callback_data: 'feedback' }],
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

