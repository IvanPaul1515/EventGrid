import { prisma } from '../src/config/db.js';

async function main() {
  const configs = await prisma.emailConfig.findMany();
  for (const c of configs) {
    await prisma.emailConfig.update({
      where: { id: c.id },
      data: { isEnabled: true },
    });
  }
  console.log('Updated configs to isEnabled: true');
}

main().finally(() => prisma.$disconnect());
