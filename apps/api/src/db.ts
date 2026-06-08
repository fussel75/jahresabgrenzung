import { PrismaClient } from '@prisma/client';

/** Einzelne, wiederverwendete Prisma-Client-Instanz. */
export const prisma = new PrismaClient();
