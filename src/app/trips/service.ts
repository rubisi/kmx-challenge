import { prisma } from "../../lib/prisma";
import type { TripCreateDTO } from "../../types/dto";

// Convert values from CSV to enum-friendly UPPER_SNAKE_CASE strings
const toEnum = (raw: string) =>
  raw.trim().toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");

// Parse date in DD/MM/YYYY format to a Date object (in UTC)
const parseDateDDMMYYYY = (s: string) => {
  const [dd, mm, yyyy] = s.split("/");
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0));
};

export class TripService {
  // Return a paginated list of trips with related data
  async getTrips(page = 1, limit = 10) {
    // Default to page 1, limit 10
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

  // Create a trip from a single CSV-shaped JSON row
  async createFromCsvRow(row: TripCreateDTO) {
    // Normalize enums & parse date
    const bodyType = toEnum(row.body_type);
    const segment = toEnum(row.segment);
    const chargingType = toEnum(row.charging_type);
    const tripDate = parseDateDDMMYYYY(row.trip_date);

    // Insert related entities (We use "Upsert" to ensure we don't create duplicates if the same entity already exists)
    const manufacturer = await prisma.manufacturer.upsert({
      where: { name: row.manufacturer },
      update: {},
      create: { name: row.manufacturer },
    });

    const model = await prisma.vehicleModel.upsert({
      where: {
        manufacturerId_name: {
          manufacturerId: manufacturer.id,
          name: row.model,
        },
      },
      update: {},
      create: {
        name: row.model,
        manufacturerId: manufacturer.id,
        bodyType: bodyType as any,
        segment: segment as any,
      },
    });

    const variant = await prisma.vehicleVariant.upsert({
      where: {
        modelId_batteryKwh_rangeKm_chargingType: {
          modelId: model.id,
          batteryKwh: row.battery_kwh,
          rangeKm: row.range_km,
          chargingType: chargingType as any,
        },
      },
      // If the variant already exists, still update the price since it can change over time
      update: { priceEur: row.price_eur },
      create: {
        modelId: model.id,
        batteryKwh: row.battery_kwh,
        rangeKm: row.range_km,
        chargingType: chargingType as any,
        priceEur: row.price_eur,
      },
    });

    // Upsert Locations for origin and destination (unique by city+country)
    const [origin, destination] = await Promise.all([
      prisma.location.upsert({
        where: {
          city_country: { city: row.origin_city, country: row.origin_country },
        },
        update: {},
        create: { city: row.origin_city, country: row.origin_country },
      }),
      prisma.location.upsert({
        where: {
          city_country: {
            city: row.destination_city,
            country: row.destination_country,
          },
        },
        update: {},
        create: {
          city: row.destination_city,
          country: row.destination_country,
        },
      }),
    ]);

    // We avoid duplicates by checking (tripDate + variant + origin + destination + distance).
    // Future improvement: add a 'rowHash @unique' column on Trip for strict idempotency
    const existing = await prisma.trip.findFirst({
      where: {
        tripDate,
        vehicleVariantId: variant.id,
        originId: origin.id,
        destinationId: destination.id,
        distanceKm: row.distance_km, // increase specificity
      },
    });
    // If we have already imported this exact row, return the existing record
    if (existing) return existing;

    // Create the Trip and link all foreign keys
    return prisma.trip.create({
      data: {
        tripDate,
        distanceKm: row.distance_km,
        co2_g_per_km: row.co2_g_per_km,
        grid_intensity_gco2_per_kwh: row.grid_intensity_gco2_per_kwh,
        vehicleVariantId: variant.id,
        originId: origin.id,
        destinationId: destination.id,
      },
    });
  }
}