import 'dotenv/config';

const clientUrls = (process.env.CLIENT_URL ?? 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/sfms_db?schema=public',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  clientUrl: clientUrls[0] ?? 'http://localhost:5173',
  clientUrls,
  appName: process.env.APP_NAME ?? 'Smart Farmer Management System',
  adminEmail: process.env.ADMIN_EMAIL ?? 'Hudsonkipchirchir@gmail.com',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'Hudson7909',
  weatherApiKey: process.env.WEATHER_API_KEY ?? '',
  weatherLocation: process.env.WEATHER_LOCATION ?? 'Nairobi,KE',
  weatherBaseUrl: process.env.OPENWEATHER_BASE_URL ?? 'https://api.openweathermap.org/data/2.5',
};
