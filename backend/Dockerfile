FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install 
RUN npm install -g @nestjs/cli 

# Copy Prisma config and schema before generating client
COPY prisma.config.ts ./ 
COPY prisma/ ./prisma/

# Generate prisma client
# DATABASE_URL is passed as build arg from docker-compose.yml
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate

# Copy rest of the application code
COPY . .

# Build NestJS project
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
