import { createQorvexApiApp, listenQorvexApi } from './bootstrap';

async function bootstrap() {
  const app = await createQorvexApiApp();
  await listenQorvexApi(app);
}

void bootstrap();
