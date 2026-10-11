import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'Hudsonkipchirchir@gmail.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Hudson7909';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    console.log(`Admin already exists: ${existing.email}`);
    return;
  }

  const passwordHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.create({
    data: {
      name: 'System Administrator',
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      location: 'Head Office',
      preferredUnits: 'kg',
    },
  });

  console.log(`Created admin account: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error('Admin bootstrapping failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
