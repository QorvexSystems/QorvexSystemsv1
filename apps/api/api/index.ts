import type { INestApplication } from '@nestjs/common';
import { createQorvexApiApp } from '../src/bootstrap';

let cachedApp: INestApplication | null = null;

async function getServer() {
  if (!cachedApp) {
    cachedApp = await createQorvexApiApp();
    await cachedApp.init();
  }

  return cachedApp.getHttpAdapter().getInstance();
}

export default async function handler(request: unknown, response: unknown) {
  const server = await getServer();
  return server(request, response);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
