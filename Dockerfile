# Використовуємо офіційний Node.js образ
FROM node:20-slim

# Встановлюємо ffmpeg та необхідні залежності
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Створюємо робочу директорію
WORKDIR /app

# Копіюємо package.json та package-lock.json (якщо є)
COPY package*.json ./

# Встановлюємо залежності
RUN npm ci --only=production

# Копіюємо весь код
COPY . .

# Відкриваємо порт
EXPOSE 3000

# Запускаємо додаток
CMD ["npm", "start"]

