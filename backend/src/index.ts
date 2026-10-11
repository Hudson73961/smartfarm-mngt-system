import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import session from 'express-session';
import { z } from 'zod';
import axios from 'axios';
import argon2 from 'argon2';
import { TaskStatus, UserRole, UserStatus } from '@prisma/client';

import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from './middleware/auth.js';
import { formatKES } from './utils/format.js';

class PrismaSessionStore extends session.Store {
  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    try {
      const sessionRow = await prisma.session.findUnique({ where: { sid } });
      if (!sessionRow) {
        callback(null, null);
        return;
      }

      if (new Date(sessionRow.expiresAt).getTime() <= Date.now()) {
        await prisma.session.delete({ where: { sid } });
        callback(null, null);
        return;
      }

      callback(null, JSON.parse(sessionRow.data) as session.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  async set(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      const expiresAt = new Date(sessionData.cookie?.expires ?? Date.now() + 8 * 60 * 60 * 1000);
      const payload = JSON.stringify(sessionData);

      await prisma.session.upsert({
        where: { sid },
        update: { data: payload, expiresAt },
        create: { id: sid, sid, data: payload, expiresAt },
      });

      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      await prisma.session.delete({ where: { sid } }).catch(() => undefined);
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }

  async touch(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      const expiresAt = new Date(sessionData.cookie?.expires ?? Date.now() + 8 * 60 * 60 * 1000);
      await prisma.session.update({ where: { sid }, data: { expiresAt } });
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }
}

const app = express();

async function ensureDatabaseReady() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (_error) {
    throw new Error('Database unavailable. Please start PostgreSQL and run the Prisma migrations.');
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please wait and try again.' },
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = new Set([
        ...(config.clientUrls ?? []),
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ]);

      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(
  session({
    name: 'sfms.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.get('/health', async (_req, res) => {
  try {
    await ensureDatabaseReady();
    res.json({ ok: true, service: config.appName, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: config.appName,
      message: error instanceof Error ? error.message : 'Database unavailable.',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      location: true,
      role: true,
      status: true,
      preferredUnits: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  res.json({ user });
});

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  location: z.string().optional(),
  phone: z.string().optional(),
});

app.post('/api/auth/register', loginLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Please provide a valid name, email, and password.' });
  }

  try {
    await ensureDatabaseReady();
  } catch (error) {
    return res.status(503).json({ message: error instanceof Error ? error.message : 'Database unavailable.' });
  }

  const { name, email, password, location, phone } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        location,
        phone,
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    return res.status(201).json({ user, message: 'Registration successful.' });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Registration failed.' });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid email or password.' });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const valid = await argon2.verify(user.passwordHash, parsed.data.password).catch(() => false);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (user.status !== UserStatus.ACTIVE) {
    return res.status(403).json({ message: 'This account is not active.' });
  }

  req.session.userId = user.id;
  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ message: 'Could not log out cleanly.' });
    res.clearCookie('sfms.sid');
    return res.json({ message: 'Logged out successfully.' });
  });
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (_req, res) => {
  const [farmerCount, activeCount, inactiveCount, farmCount, cropCount, livestockCount, activityCount, expenseAgg, incomeAgg, taskOpen] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.FARMER } }),
    prisma.user.count({ where: { role: UserRole.FARMER, status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { role: UserRole.FARMER, status: UserStatus.INACTIVE } }),
    prisma.farm.count(),
    prisma.crop.count(),
    prisma.livestock.count(),
    prisma.activity.count(),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.income.aggregate({ _sum: { totalAmount: true } }),
    prisma.task.count({ where: { status: TaskStatus.OPEN } }),
  ]);

  const profit = Number(incomeAgg._sum.totalAmount ?? 0) - Number(expenseAgg._sum.amount ?? 0);
  const registrationSample = await prisma.user.findMany({ select: { createdAt: true } });

  res.json({
    stats: {
      totalFarmers: farmerCount,
      activeFarmers: activeCount,
      inactiveFarmers: inactiveCount,
      totalFarms: farmCount,
      totalCrops: cropCount,
      totalLivestock: livestockCount,
      totalActivities: activityCount,
      totalExpenses: Number(expenseAgg._sum.amount ?? 0),
      totalIncome: Number(incomeAgg._sum.totalAmount ?? 0),
      totalProfit: profit,
      pendingTasks: taskOpen,
    },
    charts: {
      registrations: registrationSample.length,
      currency: 'KES',
    },
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const search = String(Array.isArray(req.query.search) ? String(req.query.search[0]) : typeof req.query.search === 'string' ? req.query.search : '').trim();
  const statusValue = Array.isArray(req.query.status) ? String(req.query.status[0]) : typeof req.query.status === 'string' ? req.query.status : undefined;
  const status = statusValue ? (statusValue as UserStatus) : undefined;

  const where: any = {
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { location: { contains: search } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        location: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, limit });
});

app.patch('/api/admin/users/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Status is invalid.' });
  }

  const routeUserId = Array.isArray(req.params.id) ? String(req.params.id[0]) : typeof req.params.id === 'string' ? req.params.id : undefined;
  if (!routeUserId) return res.status(400).json({ message: 'User id is required.' });

  const user = await prisma.user.update({
    where: { id: routeUserId },
    data: { status: parsed.data.status },
    select: { id: true, name: true, email: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: user.id,
      details: { status: parsed.data.status },
    },
  });

  res.json({ user, message: 'User status updated.' });
});

app.get('/api/farmer/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const farms = await prisma.farm.findMany({ where: { userId: req.user!.id } });
  const farmIds = farms.map((farm) => farm.id);

  if (farmIds.length === 0) {
    return res.json({
      farms: [],
      metrics: {
        totalCrops: 0,
        totalLivestock: 0,
        activeTasks: 0,
        totalExpenses: 0,
        totalIncome: 0,
        estimatedProfit: 0,
      },
      recentActivities: [],
      currency: 'KES',
      formattedProfit: formatKES(0),
    });
  }

  const [cropCount, livestockCount, taskCount, expenseAgg, incomeAgg, recentActivities] = await Promise.all([
    prisma.crop.count({ where: { farmId: { in: farmIds } } }),
    prisma.livestock.count({ where: { farmId: { in: farmIds } } }),
    prisma.task.count({ where: { farmId: { in: farmIds }, status: { not: TaskStatus.COMPLETED } } }),
    prisma.expense.aggregate({ where: { farmId: { in: farmIds } }, _sum: { amount: true } }),
    prisma.income.aggregate({ where: { farmId: { in: farmIds } }, _sum: { totalAmount: true } }),
    prisma.activity.findMany({
      where: { farmId: { in: farmIds } },
      orderBy: { activityDate: 'desc' },
      take: 6,
    }),
  ]);

  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
  const totalIncome = Number(incomeAgg._sum.totalAmount ?? 0);
  const profit = totalIncome - totalExpenses;

  return res.json({
    farms,
    metrics: {
      totalCrops: cropCount,
      totalLivestock: livestockCount,
      activeTasks: taskCount,
      totalExpenses: totalExpenses,
      totalIncome: totalIncome,
      estimatedProfit: profit,
    },
    recentActivities,
    currency: 'KES',
    formattedProfit: formatKES(profit),
  });
});

app.get('/api/farmer/farms', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const farms = await prisma.farm.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ farms });
});

app.post('/api/farmer/farms', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ name: z.string().min(2), location: z.string().min(2), sizeHa: z.coerce.number().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Please provide valid farm details.' });

  const farm = await prisma.farm.create({
    data: {
      userId: req.user!.id,
      name: parsed.data.name,
      location: parsed.data.location,
      sizeHa: parsed.data.sizeHa ?? 0,
    },
  });

  res.status(201).json({ farm });
});

app.get('/api/farmer/crops', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const farmIdValue = Array.isArray(req.query.farmId) ? req.query.farmId[0] : typeof req.query.farmId === 'string' ? req.query.farmId : undefined;
  const farmId = typeof farmIdValue === 'string' ? farmIdValue : undefined;
  const crops = await prisma.crop.findMany({
    where: {
      ...(farmId ? { farmId: { equals: farmId } } : {}),
      farm: { userId: req.user!.id },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ crops });
});

app.post('/api/farmer/crops', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    farmId: z.string(),
    name: z.string().min(2),
    variety: z.string().optional(),
    plotId: z.string().optional(),
    status: z.enum(['PLANNED', 'ACTIVE', 'HARVESTED', 'ARCHIVED']).optional(),
    plantingDate: z.string().optional(),
    expectedHarvestDate: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Crop details are invalid.' });

  const farm = await prisma.farm.findFirst({ where: { id: parsed.data.farmId, userId: req.user!.id } });
  if (!farm) return res.status(403).json({ message: 'Farm access denied.' });

  const crop = await prisma.crop.create({
    data: {
      farmId: farm.id,
      name: parsed.data.name,
      variety: parsed.data.variety,
      plotId: parsed.data.plotId,
      status: parsed.data.status ?? 'PLANNED',
      plantingDate: parsed.data.plantingDate ? new Date(parsed.data.plantingDate) : null,
      expectedHarvestDate: parsed.data.expectedHarvestDate ? new Date(parsed.data.expectedHarvestDate) : null,
    },
  });

  res.status(201).json({ crop });
});

app.get('/api/farmer/livestock', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const farmIdValue = Array.isArray(req.query.farmId) ? req.query.farmId[0] : typeof req.query.farmId === 'string' ? req.query.farmId : undefined;
  const farmId = typeof farmIdValue === 'string' ? farmIdValue : undefined;
  const animals = await prisma.livestock.findMany({
    where: {
      ...(farmId ? { farmId: { equals: farmId } } : {}),
      farm: { userId: req.user!.id },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ animals });
});

app.post('/api/farmer/livestock', requireAuth, async (req, res) => {
  const schema = z.object({
    farmId: z.string(),
    type: z.string().min(2),
    breed: z.string().optional(),
    quantity: z.coerce.number().min(1).optional(),
    status: z.enum(['ACTIVE', 'SICK', 'SOLD', 'DECEASED', 'ARCHIVED']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Livestock details are invalid.' });

  const farm = await prisma.farm.findFirst({ where: { id: parsed.data.farmId, userId: req.user!.id } });
  if (!farm) return res.status(403).json({ message: 'Farm access denied.' });

  const livestock = await prisma.livestock.create({
    data: {
      farmId: farm.id,
      type: parsed.data.type,
      breed: parsed.data.breed,
      quantity: parsed.data.quantity ?? 1,
      status: parsed.data.status ?? 'ACTIVE',
    },
  });

  res.status(201).json({ livestock });
});

app.get('/api/farmer/tasks', requireAuth, async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.user!.id },
    orderBy: { dueDate: 'asc' },
  });
  res.json({ tasks });
});

app.post('/api/farmer/tasks', requireAuth, async (req, res) => {
  const schema = z.object({
    farmId: z.string(),
    title: z.string().min(2),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Task details are invalid.' });

  const farm = await prisma.farm.findFirst({ where: { id: parsed.data.farmId, userId: req.user!.id } });
  if (!farm) return res.status(403).json({ message: 'Farm access denied.' });

  const task = await prisma.task.create({
    data: {
      farmId: farm.id,
      userId: req.user!.id,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      priority: parsed.data.priority ?? 'MEDIUM',
      status: 'OPEN',
    },
  });

  res.status(201).json({ task });
});

app.post('/api/farmer/expenses', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    farmId: z.string(),
    category: z.string().min(2),
    amount: z.coerce.number().min(0),
    description: z.string().optional(),
    date: z.string().optional(),
    paymentMethod: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Expense details are invalid.' });

  const farm = await prisma.farm.findFirst({ where: { id: parsed.data.farmId, userId: req.user!.id } });
  if (!farm) return res.status(403).json({ message: 'Farm access denied.' });

  const expense = await prisma.expense.create({
    data: {
      farmId: farm.id,
      userId: req.user!.id,
      category: parsed.data.category,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      paymentMethod: parsed.data.paymentMethod,
    },
  });

  res.status(201).json({ expense });
});

app.post('/api/farmer/income', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    farmId: z.string(),
    source: z.string().min(2),
    product: z.string().optional(),
    totalAmount: z.coerce.number().min(0),
    date: z.string().optional(),
    buyerRef: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Income details are invalid.' });

  const farm = await prisma.farm.findFirst({ where: { id: parsed.data.farmId, userId: req.user!.id } });
  if (!farm) return res.status(403).json({ message: 'Farm access denied.' });

  const income = await prisma.income.create({
    data: {
      farmId: farm.id,
      userId: req.user!.id,
      source: parsed.data.source,
      product: parsed.data.product,
      totalAmount: parsed.data.totalAmount,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      buyerRef: parsed.data.buyerRef,
    },
  });

  res.status(201).json({ income });
});

app.get('/api/weather', requireAuth, async (_req, res) => {
  const fallback = {
    location: 'Nairobi, Kenya',
    temperature: 23.8,
    humidity: 72,
    rainfall: 3.2,
    description: 'Partly cloudy',
    updatedAt: new Date().toISOString(),
    stale: true,
    source: 'last-known-demo-data',
  };

  if (!config.weatherApiKey) {
    return res.json({ ...fallback, location: 'Nairobi, Kenya' });
  }

  try {
    const response = await axios.get(`${config.weatherBaseUrl}/weather`, {
      params: {
        q: config.weatherLocation,
        appid: config.weatherApiKey,
        units: 'metric',
      },
      timeout: 10000,
    });

    const payload = response.data;
    return res.json({
      location: payload.name ?? 'Nairobi, Kenya',
      temperature: payload.main?.temp ?? 0,
      humidity: payload.main?.humidity ?? 0,
      rainfall: payload.rain?.['1h'] ?? 0,
      description: payload.weather?.[0]?.description ?? 'Weather data available',
      updatedAt: new Date().toISOString(),
      stale: false,
      source: 'openweather',
    });
  } catch (_error) {
    return res.json(fallback);
  }
});

app.post('/api/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    operations: z.array(
      z.object({
        clientId: z.string(),
        tableName: z.string(),
        operation: z.enum(['create', 'update', 'delete']),
        payload: z.any(),
      }),
    ),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid sync payload.' });

  const results = [] as Array<{ clientId: string; status: string }>;
  for (const item of parsed.data.operations) {
    const duplicate = await prisma.syncQueue.findFirst({
      where: { userId: req.user!.id, clientId: item.clientId },
    });

    if (duplicate) {
      results.push({ clientId: item.clientId, status: 'duplicate' });
      continue;
    }

    await prisma.syncQueue.create({
      data: {
        userId: req.user!.id,
        tableName: item.tableName,
        operation: item.operation,
        payload: item.payload,
        clientId: item.clientId,
        status: 'SYNCED',
      },
    });

    results.push({ clientId: item.clientId, status: 'synced' });
  }

  res.json({ synced: results });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`${config.appName} API running on http://localhost:${config.port}`);
  });
}
