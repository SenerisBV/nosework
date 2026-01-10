import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __noseworkPrisma: PrismaClient | undefined;
}

let prismaClient: PrismaClient | null = null;

export function getClient(): PrismaClient {
  if (prismaClient) {
    return prismaClient;
  }

  // In development, use global to preserve client across hot reloads
  if (process.env.NODE_ENV === "development") {
    if (!global.__noseworkPrisma) {
      global.__noseworkPrisma = new PrismaClient({
        datasourceUrl: process.env.ANALYTICS_DATABASE_URL,
      });
    }
    prismaClient = global.__noseworkPrisma;
  } else {
    prismaClient = new PrismaClient({
      datasourceUrl: process.env.ANALYTICS_DATABASE_URL,
    });
  }

  return prismaClient;
}

export async function disconnect(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
}
