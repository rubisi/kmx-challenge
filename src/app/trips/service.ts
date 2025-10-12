import { prisma } from "../../lib/prisma";

export class TripService {
// Return a paginated list of trips with related data
  async getTrips(page = 1, limit = 10) { // Default to page 1, limit 10
    const take = Math.min(Math.max(Number(limit) || 10, 1), 100); // Hard cap limit to 100 to avoid accidental heavy queries
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take; // Calculate offset for pagination

    const [items, total] = await Promise.all([
      prisma.trip.findMany({
        skip,
        take,
        orderBy: { id: "desc" }, // newest first but if preferred, we can change this to order by tripDate
        include: {
          vehicleVariant: {
            include: {
              model: { include: { manufacturer: true } },
            },
          },
          origin: true,
          destination: true,
        },
      }),
      prisma.trip.count(), // total for pagination meta
    ]);

    return {
      data: items,
      meta: {
        page: Number(page) || 1,
        limit: take,
        total,
        pages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }
}