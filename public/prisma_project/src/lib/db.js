import { PrismaClient } from '@prisma/client';

// Next.js serverless এ hot-reload এর সময় নতুন connection না খোলার জন্য
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
