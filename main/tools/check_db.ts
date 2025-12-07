
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const pairs = await prisma.forwardPair.findMany();
    console.log(JSON.stringify(pairs, null, 2));
}
main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
