const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client'); // ডিফল্ট ক্লায়েন্ট পাথ

// PostgreSQL কানেকশন পুল এবং অ্যাডাপ্টার তৈরি
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const defaultDepartments = [
  { name: 'Computer Science & Technology',              code: 'CST', technologyCode: '85' },
  { name: 'Mechatronics Technology',                    code: 'MCT', technologyCode: '92' },
  { name: 'Architecture Technology',                    code: 'ARC', technologyCode: '61' },
  { name: 'Food Technology',                            code: 'FT',  technologyCode: '69' },
  { name: 'Refrigeration & Air Conditioning Technology',code: 'RAC', technologyCode: '72' },
  { name: 'Civil Technology',                           code: 'CVL', technologyCode: '56' },
  { name: 'Electrical Technology',                      code: 'EL',  technologyCode: '52' },
];

async function main() {
  console.log('🌱 Seeding database...');

  for (const dept of defaultDepartments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, technologyCode: dept.technologyCode },
      create: { ...dept, isActive: true },
    });
  }

  // Default global settings
  await prisma.settings.upsert({
    where: { key: 'global' },
    update: {},
    create: { key: 'global', attendanceThreshold: 70 },
  });

  console.log('✅ Seed completed!');
}

main()
  .catch((e) => { 
    console.error(e); 
    process.exit(1); 
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // ডাটাবেজ কানেকশন পুল ক্লোজ করা
  });
