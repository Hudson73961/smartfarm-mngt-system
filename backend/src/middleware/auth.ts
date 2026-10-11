import type { NextFunction, Request, Response } from 'express';
import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = req.session?.userId as string | undefined;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return res.status(401).json({ message: 'Your account is not active or could not be found.' });
  }

  req.user = user;
  return next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ message: 'Administrator access required.' });
  }

  return next();
}

export function requireFarmerOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.FARMER)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  return next();
}
