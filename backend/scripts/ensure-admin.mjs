import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const newEmail = 'Hudsonkipchirchir@gmail.com';
const newPassword = 'Hudson7909';
const normalized = newEmail.toLowerCase();

try {
  let user = await prisma.user.findUnique({ where: { email: normalized } });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: normalized,
        passwordHash: await argon2.hash(newPassword),
        role: 'ADMIN',
        status: 'ACTIVE',
        name: 'System Administrator',
        location: 'Head Office',
        preferredUnits: 'kg',
      },
    });
    console.log('Updated admin to ' + normalized);
  } else {
    const oldAdmin = await prisma.user.findFirst({
      where: {
        email: { in: ['admin@smartfarmer.local'] },
      },
    });

    if (oldAdmin) {
      user = await prisma.user.update({
        where: { id: oldAdmin.id },
        data: {
          email: normalized,
          passwordHash: await argon2.hash(newPassword),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'System Administrator',
          location: 'Head Office',
          preferredUnits: 'kg',
        },
      });
      console.log('Migrated admin from old email to ' + normalized);
    } else {
      user = await prisma.user.create({
        data: {
          name: 'System Administrator',
          email: normalized,
          passwordHash: await argon2.hash(newPassword),
          role: 'ADMIN',
          status: 'ACTIVE',
          location: 'Head Office',
          preferredUnits: 'kg',
        },
      });
      console.log('Created admin account ' + normalized);
    }
  }

  const records = await prisma.user.findMany({
    where: { email: { in: [normalized, 'admin@smartfarmer.local'] } },
    select: { email: true, role: true, status: true },
  });

  console.log(JSON.stringify(records, null, 2));
} finally {
  await prisma.$disconnect();
}
