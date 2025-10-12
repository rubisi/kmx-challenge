import { PrismaClient } from "../../generated/prisma";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? [] : ["query", "warn", "error"], // Enable query, warn, and error logs in development
});