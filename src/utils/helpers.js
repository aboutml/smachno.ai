/**
 * Приховує persistent keyboard
 */
export const removeKeyboard = async (ctx) => {
  try {
    const removeMsg = await ctx.telegram.sendMessage(ctx.chat.id, '', {
      reply_markup: { remove_keyboard: true },
    }).catch(() => null);
    if (removeMsg) {
      await ctx.telegram.deleteMessage(ctx.chat.id, removeMsg.message_id).catch(() => {});
    }
  } catch (e) {
    // Ігноруємо помилки
  }
};

/**
 * Перевіряє, чи користувач є адміністратором
 */
export const isAdmin = (userId, adminUserIds) => {
  return adminUserIds.includes(userId);
};

