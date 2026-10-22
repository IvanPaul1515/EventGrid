import { prisma } from '../src/config/db.js';

async function main() {
  const configs = await prisma.emailConfig.findMany();
  console.log('EMAIL CONFIGS IN DB:', configs);
}

main().finally(() => prisma.$disconnect());
