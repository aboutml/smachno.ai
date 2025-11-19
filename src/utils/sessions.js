/**
 * Зберігання стану користувачів (для MVP - в пам'яті)
 * Структура: { telegramId: { photoUrl, style, customWishes, originalPhotoUrl } }
 */
export const userSessions = new Map();

/**
 * Отримує сесію користувача
 */
export const getSession = (telegramId) => {
  return userSessions.get(telegramId);
};

/**
 * Встановлює сесію користувача
 */
export const setSession = (telegramId, session) => {
  userSessions.set(telegramId, session);
};

/**
 * Видаляє сесію користувача
 */
export const deleteSession = (telegramId) => {
  userSessions.delete(telegramId);
};

/**
 * Отримує або створює сесію з фото з останнього креативу
 */
export const getOrCreateSessionWithLastPhoto = async (telegramId, db) => {
  let session = getSession(telegramId);
  
  if (session && session.originalPhotoUrl) {
    return session;
  }
  
  // Завантажуємо фото з останнього креативу
  const creatives = await db.getUserCreatives(telegramId, 1);
  if (creatives && creatives.length > 0 && creatives[0].original_photo_url) {
    if (!session) {
      session = {};
    }
    session.originalPhotoUrl = creatives[0].original_photo_url;
    setSession(telegramId, session);
    return session;
  }
  
  return null;
};

