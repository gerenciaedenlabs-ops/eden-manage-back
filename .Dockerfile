# Usa una versión LTS estable
FROM node:20-alpine

WORKDIR /app

# Instalamos dependencias primero para aprovechar el cache de Docker
COPY package*.json ./
RUN npm install --production

# Copiamos el resto del código
COPY . .

# Si usas NestJS o TypeScript, descomenta la siguiente línea:
# RUN npm run build

# Exponemos el puerto que usa tu app (ej: 3000)
EXPOSE 3000

# Comando para arrancar
CMD ["npm", "start"]