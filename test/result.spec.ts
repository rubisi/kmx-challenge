import { execSync } from "node:child_process";
import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Result endpoint", () => {
	let container: StartedPostgreSqlContainer;
	let app: express.Express;
	let agent: ReturnType<typeof request.agent>;
	let prisma: any;

	const RESULTS_PATH = "/result";

	// Setup before running any tests
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
		const { ResultRouter } = await import("../src/app/result/router");
		const { TripRouter } = await import("../src/app/trips/router");

		// Setup Express app with JSON and the TripRouter
		app = express();
		app.use(express.json());
		app.use("/result", ResultRouter);
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

	// Empty DB statistics
	it("returns zero counts on an empty database", async () => {
		// When no trips exist, the stats endpoint should return all zeros
		const res = await agent.get(RESULTS_PATH).send();
		expect(res.status).toBe(200);
		// ResultService.getEntityStatistics returns:
		// { manufacturers, models, variants, locations, trips }
		expect(res.body).toEqual({
			manufacturers: 0,
			models: 0,
			variants: 0,
			locations: 0,
			trips: 0,
		});
	});

	it("returns correct counts after creating trips", async () => {
		// Seed 2 trips via the API (ensures all relations are created)
		const rowA = {
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

		const a = await agent.post("/trips").send(rowA);
		const b = await agent.post("/trips").send(rowB);
		// Both POSTs should succeed and create new trips
		expect([200, 201]).toContain(a.status);
		expect([200, 201]).toContain(b.status);

		// Fetch statistics after insertion
		const res = await agent.get(RESULTS_PATH).send();
		expect(res.status).toBe(200);

		// Validate expected counts
		expect(res.body).toEqual({
			manufacturers: 2, // (BMW Group, Tata Motors)
			models: 2, // (iX3, Nexon EV)
			variants: 2, // (each unique by battery/range/charging type)
			locations: 4, // (New York, Casablanca, Singapore, London)
			trips: 2,
		});
	});
});
