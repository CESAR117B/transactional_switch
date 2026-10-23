FROM node:24-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Compilar la aplicación NestJS
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]