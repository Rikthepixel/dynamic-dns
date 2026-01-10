ARG NODE_VERSION=24-alpine

FROM node:$NODE_VERSION AS base
WORKDIR /app
ARG CLIENT

COPY package*.json .
COPY clients/$CLIENT/package.json clients/$CLIENT/
COPY packages/**/package.json packages/

FROM base AS build
RUN npm install --workspaces --include-workspace-root

COPY ./packages ./packages
COPY ./clients/$CLIENT ./clients/$CLIENT
COPY ./turbo.json tsconfig*.json ./

RUN npm run build

FROM base AS runner
ENV NODE_ENV=production

RUN npm install --workspaces --include-workspace-root --omit=dev 

ENV STORAGE_MODE=docker
RUN mkdir ./storage

COPY --from=build \
     --exclude=src/ \
     --exclude=tsconfig* \
     --exclude=tsup.config.ts \
     --exclude=turbo.json \
     /app/clients/$CLIENT/ ./clients/$CLIENT/

COPY --from=build \
     --exclude=**/src/ \
     --exclude=**/tsconfig* \
     --exclude=**/turbo.json \
     /app/packages/ ./packages/

WORKDIR /app/clients/$CLIENT
CMD ["npm", "run", "start"]
