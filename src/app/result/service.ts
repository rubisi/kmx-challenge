import { prisma } from "../../lib/prisma";
export class ResultService {
  async getEntityStatistics() {
    const [manufacturers, models, variants, locations, trips] =
      await Promise.all([
        prisma.manufacturer.count(),
        prisma.vehicleModel.count(),
        prisma.vehicleVariant.count(),
        prisma.location.count(),
        prisma.trip.count(),
      ]);

    return { manufacturers, models, variants, locations, trips };
  }
}
