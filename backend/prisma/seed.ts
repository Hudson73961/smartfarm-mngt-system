import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const farmerEmail = 'farmer@example.com';
  const passwordHash = await argon2.hash('FarmerPass123!');

  const user = await prisma.user.upsert({
    where: { email: farmerEmail },
    update: {},
    create: {
      name: 'Demo Farmer',
      email: farmerEmail,
      passwordHash,
      role: UserRole.FARMER,
      status: UserStatus.ACTIVE,
      location: 'Nairobi County',
      preferredUnits: 'kg',
    },
  });

  const farm = await prisma.farm.upsert({
    where: { id: 'demo-farm-id' },
    update: {},
    create: {
      id: 'demo-farm-id',
      userId: user.id,
      name: 'Sunrise Farm',
      location: 'Nairobi County',
      sizeHa: 8,
    },
  });

  await prisma.crop.upsert({
    where: { id: 'demo-crop-id' },
    update: {},
    create: {
      id: 'demo-crop-id',
      farmId: farm.id,
      name: 'Maize',
      variety: 'Hybrid 614',
      plotId: 'P-01',
      status: 'ACTIVE',
      plantingDate: new Date('2025-01-15'),
      expectedHarvestDate: new Date('2025-06-15'),
    },
  });

  console.log('Seed data created for demo farmer');
}

main()
  .catch((error) => {
    console.error('Database seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
