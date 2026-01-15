export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_DATABASE || "ai_call_intake",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "secret",
    expiration: process.env.JWT_EXPIRATION || "7d",
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || "",
  },
  ai: {
    url: process.env.AI_MODULE_URL || "http://localhost:8001",
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
  storage: {
    minio: {
      endpoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT, 10) || 9000,
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
      bucket: process.env.MINIO_BUCKET || "audio-files",
    },
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
});
