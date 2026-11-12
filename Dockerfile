FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

ENV PORT=3456
ENV PROCESSOR_MODE=simulator
ENV DEFAULT_CURRENCY=EUR

EXPOSE 3456

CMD ["node", "src/server.js"]
