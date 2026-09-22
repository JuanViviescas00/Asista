FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV TZ=America/Bogota
EXPOSE 3001

CMD ["npm", "start"]
