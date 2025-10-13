import { prisma } from "../../lib/prisma";
import type { TripCreateDTO, TripUpdateDTO } from "../../types/dto";

// Convert values from CSV to enum-friendly UPPER_SNAKE_CASE strings
const toEnum = (raw: string) =>
	raw.trim().toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");

// Parse date
// Accepts: "DD/MM/YYYY" or "YYYY-MM-DD" or Date
const parseTripDate = (input: unknown): Date => {
	if (input instanceof Date) {
		if (isNaN(input.getTime())) throw new Error("Invalid trip_date Date");
		// normalize to UTC midnight
		return new Date(
			Date.UTC(
				input.getUTCFullYear(),
				input.getUTCMonth(),
				input.getUTCDate(),
				0,
				0,
				0,
			),
		);
	}

	if (typeof input === "string") {
		const s = input.trim();

		// DD/MM/YYYY
		const m1 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
		if (m1) {
			const [, dd, mm, yyyy] = m1;
			return new Date(
				Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0),
			);
		}

		// YYYY-MM-DD
		const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
		if (m2) {
			const [, yyyy, mm, dd] = m2;
			return new Date(
				Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0),
			);
		}

		// Last resort: Date.parse
		const d = new Date(s);
		if (!isNaN(d.getTime())) {
			return new Date(
				Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0),
			);
		}
	}

	throw new Error(
		'Invalid trip_date format. Expected "DD/MM/YYYY" or "YYYY-MM-DD".',
	);
};

export class TripService {
	//  --- GET /trips ---
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

	//  --- POST /trips ---
	// Create a trip from a single CSV-shaped JSON row
	async createFromCsvRow(row: TripCreateDTO) {
		// Normalize enums & parse date
		const bodyType = toEnum(row.body_type);
		const segment = toEnum(row.segment);
		const chargingType = toEnum(row.charging_type);
		const tripDate = parseTripDate(row.trip_date);

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

	//  --- PUT /trips/:id ---
	// Update a trip by ID
	async updateTrip(id: number, patch: TripUpdateDTO) {
		// Load current trip so we can backfill missing fields and know current links
		const current = await prisma.trip.findUnique({
			where: { id },
			// include manufacturer/model/variant + origin/destination so we can fall back to existing values when needed
			include: {
				vehicleVariant: {
					include: { model: { include: { manufacturer: true } } },
				},
				origin: true,
				destination: true,
			},
		});
		if (!current) throw new Error("Trip not found");

		// --- Prepare potential foreign key changes ---

		// Decide whether we need to touch vehicle-related entities
		// If any of these fields are present, recompute the target variant
		const touchesVehicle =
			patch.manufacturer ||
			patch.model ||
			patch.body_type ||
			patch.segment ||
			patch.battery_kwh != null ||
			patch.range_km != null ||
			patch.charging_type ||
			patch.price_eur != null;

		let nextVehicleVariantId: number | undefined;
		if (touchesVehicle) {
			// Normalize/derive all needed values
			// Use incoming values if provided; otherwise fall back to current values
			const manufacturerName =
				patch.manufacturer ?? current.vehicleVariant.model.manufacturer.name;
			const modelName = patch.model ?? current.vehicleVariant.model.name;

			// Enum fields need normalization if provided; otherwise keep what's already stored
			const bodyType = patch.body_type
				? toEnum(patch.body_type)
				: current.vehicleVariant.model.bodyType;
			const segment = patch.segment
				? toEnum(patch.segment)
				: current.vehicleVariant.model.segment;
			const chargingType = patch.charging_type
				? toEnum(patch.charging_type)
				: (current.vehicleVariant.chargingType as string);

			// Specs and price: prefer incoming, else fall back to current values
			const batteryKwh = patch.battery_kwh ?? current.vehicleVariant.batteryKwh;
			const rangeKm = patch.range_km ?? current.vehicleVariant.rangeKm;
			const priceEur =
				patch.price_eur ??
				current.vehicleVariant.priceEur.toNumber?.() ??
				(current.vehicleVariant.priceEur as any);

			// Upsert manufacturer > model > variant, and then capture the new variant id
			const manufacturer = await prisma.manufacturer.upsert({
				where: { name: manufacturerName },
				update: {},
				create: { name: manufacturerName },
			});

			const model = await prisma.vehicleModel.upsert({
				where: {
					manufacturerId_name: {
						manufacturerId: manufacturer.id,
						name: modelName,
					},
				},
				// if a model already exists and bodyType/segment changed, update them
				update: {
					bodyType: bodyType as any,
					segment: segment as any,
				},
				// if model doesn't exist, create with all details
				create: {
					name: modelName,
					manufacturerId: manufacturer.id,
					bodyType: bodyType as any,
					segment: segment as any,
				},
			});

			// Upsert variant (if specs changed, this will create a new variant)
			const variant = await prisma.vehicleVariant.upsert({
				where: {
					modelId_batteryKwh_rangeKm_chargingType: {
						modelId: model.id,
						batteryKwh,
						rangeKm,
						chargingType: chargingType as any,
					},
				},
				// If the variant already exists, still update the price since it can change over time
				update: { priceEur: priceEur as any },
				// If variant doesn't exist, create with all details
				create: {
					modelId: model.id,
					batteryKwh,
					rangeKm,
					chargingType: chargingType as any,
					priceEur: priceEur as any,
				},
			});

			// Remember the new variant id so we can update the Trip later
			nextVehicleVariantId = variant.id;
		}

		// Origin location changes: if either city or country is provided, (re)upsert and relink
		let nextOriginId: number | undefined;
		if (patch.origin_city || patch.origin_country) {
			const originCity = patch.origin_city ?? current.origin.city;
			const originCountry = patch.origin_country ?? current.origin.country;

			// Locations are unique by (city, country), so upsert is safe here
			const origin = await prisma.location.upsert({
				where: { city_country: { city: originCity, country: originCountry } },
				update: {},
				create: { city: originCity, country: originCountry },
			});
			nextOriginId = origin.id;
		}

		// Destination location changes: same logic as origin
		let nextDestinationId: number | undefined;
		if (patch.destination_city || patch.destination_country) {
			const destCity = patch.destination_city ?? current.destination.city;
			const destCountry =
				patch.destination_country ?? current.destination.country;

			const destination = await prisma.location.upsert({
				where: { city_country: { city: destCity, country: destCountry } },
				update: {},
				create: { city: destCity, country: destCountry },
			});
			nextDestinationId = destination.id;
		}

		// --- Update the Trip itself  ---
		const updated = await prisma.trip.update({
			where: { id },
			data: {
				...(patch.trip_date
					? { tripDate: parseTripDate(patch.trip_date) }
					: {}),
				// Metric fields: only update if explicitly provided
				...(patch.distance_km != null ? { distanceKm: patch.distance_km } : {}),
				...(patch.co2_g_per_km != null
					? { co2_g_per_km: patch.co2_g_per_km }
					: {}),
				...(patch.grid_intensity_gco2_per_kwh != null
					? { grid_intensity_gco2_per_kwh: patch.grid_intensity_gco2_per_kwh }
					: {}),
				// Foreign keys: only update if we computed a change above
				...(nextVehicleVariantId
					? { vehicleVariantId: nextVehicleVariantId }
					: {}),
				...(nextOriginId ? { originId: nextOriginId } : {}),
				...(nextDestinationId ? { destinationId: nextDestinationId } : {}),
			},
			include: {
				vehicleVariant: {
					include: { model: { include: { manufacturer: true } } },
				},
				origin: true,
				destination: true,
			},
		});

		return updated;
	}

	//  --- DELETE /trips/:id ---
	// Delete a trip by ID
	async deleteTrip(id: number) {
		// Delete the trip and fetch the FK relations. We need these to do cleanup of potentially unreferenced related entities
		const deleted = await prisma.trip.delete({
			where: { id },
			include: {
				vehicleVariant: {
					include: { model: { include: { manufacturer: true } } },
				},
				origin: true,
				destination: true,
			},
		});

		// Run cleanup in a transaction so counts and deletes are consistent
		await prisma.$transaction(async (tx) => {
			// --- Vehicle-related cleanup ---

			// If no other Trip uses this VehicleVariant, we can delete it
			const remainingTripsForVariant = await tx.trip.count({
				where: { vehicleVariantId: deleted.vehicleVariantId },
			});

			if (remainingTripsForVariant === 0) {
				// Delete the variant itself
				const modelId = deleted.vehicleVariant.modelId;
				await tx.vehicleVariant.delete({
					where: { id: deleted.vehicleVariantId },
				});

				// If that was the last variant under its model, delete the model too
				const remainingVariantsForModel = await tx.vehicleVariant.count({
					where: { modelId },
				});
				if (remainingVariantsForModel === 0) {
					const manufacturerId = deleted.vehicleVariant.model.manufacturerId;
					await tx.vehicleModel.delete({ where: { id: modelId } });

					// And if that model was the manufacturer’s last model, remove the manufacturer too
					const remainingModelsForManufacturer = await tx.vehicleModel.count({
						where: { manufacturerId },
					});
					if (remainingModelsForManufacturer === 0) {
						await tx.manufacturer.delete({ where: { id: manufacturerId } });
					}
				}
			}

			// --- Location cleanup (origin) ---
			// Since the same location can be origin for some trips and destination for others,
			// only delete when the location id is not used in either column
			const originReferenced = await tx.trip.count({
				where: {
					OR: [
						{ originId: deleted.originId },
						{ destinationId: deleted.originId },
					],
				},
			});
			if (originReferenced === 0) {
				await tx.location.delete({ where: { id: deleted.originId } });
			}

			// --- Location cleanup (destination) ---
			// Since the same location can be origin for some trips and destination for others,
			// only delete when the location id is not used in either column
			const destinationReferenced = await tx.trip.count({
				where: {
					OR: [
						{ originId: deleted.destinationId },
						{ destinationId: deleted.destinationId },
					],
				},
			});
			if (destinationReferenced === 0) {
				await tx.location.delete({ where: { id: deleted.destinationId } });
			}
		});

		return { ok: true };
	}
}
