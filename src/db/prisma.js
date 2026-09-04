import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

let prismaInstance = null;
let isConnected = false;

export function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.DEBUG ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
    });
  }
  return prismaInstance;
}

export const prisma = getPrisma();

export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (!isConnected) {
      logger.success('Terhubung ke database MySQL via Prisma ORM.');
      isConnected = true;
    }
    return true;
  } catch (error) {
    logger.warn(`Tidak dapat terhubung ke MySQL: ${error.message}`);
    isConnected = false;
    return false;
  }
}

export default prisma;
