FROM node:24-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Si usas Prisma, genera el cliente (descomenta la siguiente línea si aplica)
# RUN npx prisma generate

# Compilar el microservicio
RUN npm run build

EXPOSE 3001

CMD ["npm", "run", "start:prod"]