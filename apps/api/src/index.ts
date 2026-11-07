import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 8140);
const app = buildApp({ logger: true, corsOrigin: process.env.CORS_ORIGIN });

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
