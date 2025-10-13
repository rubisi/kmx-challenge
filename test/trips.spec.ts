import { execSync } from "node:child_process";
import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Trips", () => {
	let container: StartedPostgreSqlContainer;
	let app: express.Express;
	let agent: ReturnType<typeof request.agent>;
	let prisma: any;

	// Setup before running any test
	beforeAll(async () => {
		// Start a temporary PostgreSQL container
		container = await new PostgreSqlContainer("postgres:16")
			.withDatabase("appdb")
			.withUsername("test")
			.withPassword("test")
			.start();

		process.env.DATABASE_URL = container.getConnectionUri();
		process.env.PRISMA_CLIENT_ENGINE_TYPE = "binary";

		// Generate Prisma client & push the schema into the test DB
		execSync("npx prisma generate", { stdio: "inherit" });
		execSync("npx prisma db push --force-reset", { stdio: "inherit" });

		({ prisma } = await import("../src/lib/prisma"));
		const { TripRouter } = await import("../src/app/trips/router");

		// Setup Express app with JSON and the TripRouter
		app = express();
		app.use(express.json());
		app.use("/trips", TripRouter);

		agent = request.agent(app);
	}, 120_000); // extend timeout for container startup & schema push

	// Cleanup after all tests
	afterAll(async () => {
		try {
			if (prisma?.$disconnect) await prisma.$disconnect();
		} finally {
			if (container) await container.stop();
		}
	});

	// ---- Shared test data (mock "CSV" rows) ----
	const sampleRow = {
		trip_date: "10/02/2025",
		manufacturer: "BMW Group",
		model: "iX3",
		body_type: "Crossover",
		segment: "Mid-size",
		battery_kwh: 80,
		range_km: 463,
		charging_type: "DC",
		price_eur: 70157,
		origin_city: "New York",
		origin_country: "United States",
		destination_city: "Casablanca",
		destination_country: "Morocco",
		distance_km: 5813,
		co2_g_per_km: 58,
		grid_intensity_gco2_per_kwh: 350,
	};

	const rowA = sampleRow;
	const rowB = {
		trip_date: "2025-10-13",
		manufacturer: "Tata Motors",
		model: "Nexon EV",
		body_type: "Compact SUV",
		segment: "Luxury",
		battery_kwh: 40,
		range_km: 224,
		charging_type: "AC",
		price_eur: 111873,
		origin_city: "Singapore",
		origin_country: "Singapore",
		destination_city: "London",
		destination_country: "United Kingdom",
		distance_km: 10852,
		co2_g_per_km: 55,
		grid_intensity_gco2_per_kwh: 250,
	};

	// ---- POST endpoint tests ----
	describe("POST /trips", () => {
		it("creates a trip from a CSV-shaped JSON row", async () => {
			const res = await agent.post("/trips").send(sampleRow);

			// Expect successful creation (either 200 or 201 depending on router)
			expect([200, 201]).toContain(res.status);
			// Verify the Trip has a numeric ID
			expect(typeof res.body.id).toBe("number");

			// Check response key fields match input data
			expect(res.body.distanceKm ?? res.body.distance_km).toBe(5813);
			expect(
				res.body.co2_g_per_km ?? res.body.co2GPerKm ?? res.body.co2_gPerKm,
			).toBe(58);
			expect(
				res.body.grid_intensity_gco2_per_kwh ??
					res.body.gridIntensityGco2PerKwh ??
					res.body.grid_intensity_gco2PerKwh,
			).toBe(350);

			const iso = res.body.tripDate ?? res.body.trip_date;
			if (typeof iso === "string") {
				const d = new Date(iso);
				expect(d.toISOString().startsWith("2025-02-10T00:00:00.000Z")).toBe(
					true,
				);
			}
			// Check that foreign key references exist
			expect(
				typeof (res.body.vehicleVariantId ?? res.body.vehicle_variant_id),
			).toBe("number");
			expect(typeof (res.body.originId ?? res.body.origin_id)).toBe("number");
			expect(typeof (res.body.destinationId ?? res.body.destination_id)).toBe(
				"number",
			);
		});

		it("is idempotent for the same input (returns existing trip)", async () => {
			// First POST — creates the trip
			const a = await agent.post("/trips").send(sampleRow);
			// Second POST — identical payload should NOT create a duplicate
			const b = await agent.post("/trips").send(sampleRow);
			// Both calls should succeed
			expect([200, 201]).toContain(a.status);
			expect([200, 201]).toContain(b.status);
			// The same record should be returned (same ID proves idempotency)
			expect(b.body.id).toBe(a.body.id);
		});
	});

	// ---- GET endpoint tests ----
	describe("GET /trips", () => {
		it("returns paginated trips with meta", async () => {
			// Seed the database with two example trips so pagination can be tested
			await agent.post("/trips").send(rowA);
			await agent.post("/trips").send(rowB);

			// Request the first page with a limit of 1 (expecting pagination metadata)
			const res = await agent.get("/trips?page=1&limit=1").send();

			// Expect successful response
			expect(res.status).toBe(200);
			expect(res.body).toBeDefined();

			// Expect 'data' to be an array of trips
			expect(Array.isArray(res.body.data)).toBe(true);
			expect(res.body.data.length).toBe(1); // limited to 1 per page

			// Pagination metadata should include page, limit, total count, and total pages
			expect(res.body.meta).toEqual(
				expect.objectContaining({
					page: 1,
					limit: 1,
					total: expect.any(Number),
					pages: expect.any(Number),
				}),
			);
			// There should be at least 2 total items and ≥2 total pages
			expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
			expect(res.body.meta.pages).toBeGreaterThanOrEqual(2);

			// Validate shape of a single returned trip
			const item = res.body.data[0];

			// Must have numeric identifiers for related entities
			expect(typeof item.id).toBe("number");
			expect(typeof item.vehicleVariantId).toBe("number");
			expect(typeof item.originId).toBe("number");
			expect(typeof item.destinationId).toBe("number");

			// Validate that origin and destination relations are expanded properly
			expect(item.origin).toEqual(
				expect.objectContaining({
					city: expect.any(String),
					country: expect.any(String),
				}),
			);
			expect(item.destination).toEqual(
				expect.objectContaining({
					city: expect.any(String),
					country: expect.any(String),
				}),
			);

			// Validate that vehicleVariant and nested model/manufacturer are included
			expect(item.vehicleVariant).toEqual(
				expect.objectContaining({
					batteryKwh: expect.any(Number),
					rangeKm: expect.any(Number),
					chargingType: expect.any(String),
					model: expect.objectContaining({
						name: expect.any(String),
						manufacturer: expect.objectContaining({ name: expect.any(String) }),
					}),
				}),
			);
		});
	});

	// ---- PUT endpoint tests ----
	describe("PUT /trips/:id", () => {
		it("updates trip fields and relinks to upserted vehicle variant & locations", async () => {
			// Seed a trip
			const createRes = await agent.post("/trips").send({
				trip_date: "10/02/2025",
				manufacturer: "BMW Group",
				model: "iX3",
				body_type: "Crossover",
				segment: "Mid-size",
				battery_kwh: 80,
				range_km: 463,
				charging_type: "DC",
				price_eur: 70157,
				origin_city: "New York",
				origin_country: "United States",
				destination_city: "Casablanca",
				destination_country: "Morocco",
				distance_km: 5813,
				co2_g_per_km: 58,
				grid_intensity_gco2_per_kwh: 350,
			});

			// Store trip and foreign key references for later comparison
			const tripId = createRes.body.id as number;
			const prevVariantId = (createRes.body.vehicleVariantId ??
				createRes.body.vehicle_variant_id) as number;
			const prevOriginId = (createRes.body.originId ??
				createRes.body.origin_id) as number;

			// Prepare an update payload that changes manufacturer, model, variant specs, price, and origin city/country
			// This ensures both relational links and scalar fields are updated
			const patch = {
				manufacturer: "Volvo Cars",
				model: "EX30",
				body_type: "Sedan",
				segment: "Premium",
				battery_kwh: 69,
				range_km: 375,
				charging_type: "AC",
				price_eur: 99949,
				origin_city: "Los Angeles",
				origin_country: "United States",
				trip_date: "21/10/2025", // DD/MM/YYYY supported
				distance_km: 3944,
				co2_g_per_km: 70,
				grid_intensity_gco2_per_kwh: 350,
			};

			// Send PUT /trips/:id to perform the update
			const res = await agent.put(`/trips/${tripId}`).send(patch);
			expect(res.status).toBe(200);

			// --- Verify relational updates ---
			// vehicleVariantId should now point to a different variant
			const newVariantId = (res.body.vehicleVariantId ??
				res.body.vehicle_variant_id) as number;
			expect(newVariantId).toBeGreaterThan(0);
			expect(newVariantId).not.toBe(prevVariantId);

			// originId should also change due to new origin city/country
			const newOriginId = (res.body.originId ?? res.body.origin_id) as number;
			expect(newOriginId).toBeGreaterThan(0);
			expect(newOriginId).not.toBe(prevOriginId);

			// --- Verify scalar field updates ---
			expect(res.body.distanceKm ?? res.body.distance_km).toBe(3944);
			expect(
				res.body.co2_g_per_km ?? res.body.co2GPerKm ?? res.body.co2_gPerKm,
			).toBe(70);
			expect(
				res.body.grid_intensity_gco2_per_kwh ??
					res.body.gridIntensityGco2PerKwh ??
					res.body.grid_intensity_gco2PerKwh,
			).toBe(350);

			// tripDate normalized to UTC midnight for 2025-10-21
			const iso = res.body.tripDate ?? res.body.trip_date;
			if (typeof iso === "string") {
				const d = new Date(iso);
				expect(d.toISOString().startsWith("2025-10-21T00:00:00.000Z")).toBe(
					true,
				);
			}

			// Verify the variant price was updated at the DB level
			const variant = await prisma.vehicleVariant.findUnique({
				where: { id: newVariantId },
			});
			// Prisma Decimal or number
			const price =
				(variant?.priceEur as any)?.toNumber?.() ?? (variant?.priceEur as any);
			expect(price).toBe(99949);
		});
	});

	// ---- DELETE endpoint tests ----
	describe("DELETE /trips/:id", () => {
		it("deletes the trip and cascades cleanup of unreferenced variant/model/manufacturer and locations", async () => {
			// Create a unique trip entry to later delete
			const uniqueRow = {
				trip_date: "2025-09-14",
				manufacturer: "UnitTest Motors",
				model: "SpecX",
				body_type: "Hatchback",
				segment: "Luxury",
				battery_kwh: 58,
				range_km: 302,
				charging_type: "DC",
				price_eur: 106159,
				origin_city: "Testville",
				origin_country: "Testland",
				destination_city: "Mock City",
				destination_country: "Mockland",
				distance_km: 1234,
				co2_g_per_km: 42,
				grid_intensity_gco2_per_kwh: 150,
			};

			// Create the trip using POST /trips
			const createRes = await agent.post("/trips").send(uniqueRow);
			expect([200, 201]).toContain(createRes.status);

			// Store primary and related entity IDs for later validation
			const tripId = createRes.body.id as number;
			const variantId = (createRes.body.vehicleVariantId ??
				createRes.body.vehicle_variant_id) as number;
			const originId = (createRes.body.originId ??
				createRes.body.origin_id) as number;
			const destinationId = (createRes.body.destinationId ??
				createRes.body.destination_id) as number;

			// Fetch nested model and manufacturer IDs before deletion (so we can check cleanup)
			const variantFull = await prisma.vehicleVariant.findUnique({
				where: { id: variantId },
				include: { model: { include: { manufacturer: true } } },
			});
			const modelId = variantFull!.modelId;
			const manufacturerId = variantFull!.model.manufacturerId;

			// Perform DELETE /trips/:id
			const delRes = await agent.delete(`/trips/${tripId}`).send();
			expect([200, 204]).toContain(delRes.status);
			// API returns { ok: true }
			if (delRes.status === 200) {
				expect(delRes.body).toEqual(expect.objectContaining({ ok: true }));
			}

			// Verify the trip is fully removed from the database
			const tripGone = await prisma.trip.findUnique({ where: { id: tripId } });
			expect(tripGone).toBeNull();

			// Variant/model/manufacturer cleaned up (no other references)
			const variantGone = await prisma.vehicleVariant.findUnique({
				where: { id: variantId },
			});
			expect(variantGone).toBeNull();

			const modelGone = await prisma.vehicleModel.findUnique({
				where: { id: modelId },
			});
			expect(modelGone).toBeNull();

			const manufacturerGone = await prisma.manufacturer.findUnique({
				where: { id: manufacturerId },
			});
			expect(manufacturerGone).toBeNull();

			// Locations cleaned up if not referenced elsewhere
			const originGone = await prisma.location.findUnique({
				where: { id: originId },
			});
			const destinationGone = await prisma.location.findUnique({
				where: { id: destinationId },
			});
			expect(originGone).toBeNull();
			expect(destinationGone).toBeNull();
		});

		it("keeps shared nested entities when another trip still references them", async () => {
			// Seed two trips that share the SAME vehicle variant and origin,
			// but have DIFFERENT destinations and dates/distances
			const base = {
				// variant & model/manufacturer fields (shared)
				manufacturer: "BMW Group",
				model: "iX3",
				body_type: "Crossover",
				segment: "Mid-size",
				battery_kwh: 80,
				range_km: 463,
				charging_type: "DC",
				price_eur: 70157,

				// origin (shared)
				origin_city: "New York",
				origin_country: "United States",

				// emissions (arbitrary)
				co2_g_per_km: 58,
				grid_intensity_gco2_per_kwh: 350,
			};

			// Trip 1: New York to Casablanca
			const t1 = await agent.post("/trips").send({
				...base,
				trip_date: "10/02/2025",
				destination_city: "Dublin",
				destination_country: "Ireland",
				distance_km: 5110,
			});
			expect([200, 201]).toContain(t1.status);

			// Trip 2: New York to London (same variant & origin, different destination/date/distance)
			const t2 = await agent.post("/trips").send({
				...base,
				trip_date: "11/02/2025",
				destination_city: "London",
				destination_country: "United Kingdom",
				distance_km: 5567,
			});
			expect([200, 201]).toContain(t2.status);

			// Grab IDs for assertions
			const trip1Id = t1.body.id as number;
			const variantId = (t1.body.vehicleVariantId ??
				t1.body.vehicle_variant_id) as number;
			const originId = (t1.body.originId ?? t1.body.origin_id) as number;
			const dest1Id = (t1.body.destinationId ??
				t1.body.destination_id) as number;
			const dest2Id = (t2.body.destinationId ??
				t2.body.destination_id) as number;

			// Also capture model/manufacturer IDs
			const variantFull = await prisma.vehicleVariant.findUnique({
				where: { id: variantId },
				include: { model: { include: { manufacturer: true } } },
			});
			const modelId = variantFull!.modelId;
			const manufacturerId = variantFull!.model.manufacturerId;

			// Delete only Trip 1 (New York to Casablanca)
			const delRes = await agent.delete(`/trips/${trip1Id}`).send();
			expect([200, 204]).toContain(delRes.status);
			if (delRes.status === 200) {
				expect(delRes.body).toEqual(expect.objectContaining({ ok: true }));
			}

			// Trip 1 removed
			const trip1Gone = await prisma.trip.findUnique({
				where: { id: trip1Id },
			});
			expect(trip1Gone).toBeNull();

			// Shared nested entities should still exist (because Trip 2 references them)
			const variantStillThere = await prisma.vehicleVariant.findUnique({
				where: { id: variantId },
			});
			expect(variantStillThere).not.toBeNull();

			const originStillThere = await prisma.location.findUnique({
				where: { id: originId },
			});
			expect(originStillThere).not.toBeNull();

			const modelStillThere = await prisma.vehicleModel.findUnique({
				where: { id: modelId },
			});
			expect(modelStillThere).not.toBeNull();

			const manufacturerStillThere = await prisma.manufacturer.findUnique({
				where: { id: manufacturerId },
			});
			expect(manufacturerStillThere).not.toBeNull();

			// Destination 1 (Dublin) should be gone
			const dest1Gone = await prisma.location.findUnique({
				where: { id: dest1Id },
			});
			expect(dest1Gone).toBeNull();

			// Destination 2 (London) should remain
			const dest2StillThere = await prisma.location.findUnique({
				where: { id: dest2Id },
			});
			expect(dest2StillThere).not.toBeNull();
		});
	});
});
