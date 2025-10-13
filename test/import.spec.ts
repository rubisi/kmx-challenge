import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Importer script (src/import/index.ts)", () => {
	let container: StartedPostgreSqlContainer;
	let app: express.Express;
	let server: any;
	let baseUrl: string;
	let prisma: any;
	let prevCwd: string;
	let sandboxDir: string;

	// Capture console output produced by the importer for verification
	const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
		const { ResultRouter } = await import("../src/app/result/router");

		// Setup Express app with JSON and the TripRouter
		app = express();
		app.use(express.json());
		app.use("/trips", TripRouter);
		app.use("/result", ResultRouter);
		
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		const address = server.address();
		const port =
			typeof address === "object" && address && "port" in address
				? (address.port as number)
				: 0;
		baseUrl = `http://127.0.0.1:${port}`;
		process.env.API_BASE_URL = baseUrl;

		// Create a temp project directory with data/input.csv and change working directory there
		prevCwd = process.cwd();
		sandboxDir = mkdtempSync(join(tmpdir(), "kmx-import-"));
		mkdirSync(join(sandboxDir, "data"));

		// CSV content matches the headers expected by parseCsvToJson()
		const csv = [
			// header row
			"trip_date,manufacturer,model,body_type,segment,battery_kwh,range_km,charging_type,price_eur,origin_city,origin_country,destination_city,destination_country,distance_km,co2_g_per_km,grid_intensity_gco2_per_kwh",
			// two valid data rows
			"10/02/2025,BMW Group,iX3,Crossover,Mid-size,80,463,DC,70157,New York,United States,Casablanca,Morocco,5813,58,350",
			"2025-10-13,Tata Motors,Nexon EV,Compact SUV,Luxury,40,224,AC,111873,Singapore,Singapore,London,United Kingdom,10852,55,250",
			// a trailing blank row to verify the importer skips empties
			",,,,,,,,,,,,,,,",
		].join("\n");

		// Write the CSV to /data/input.csv in the sandbox dir
		writeFileSync(join(sandboxDir, "data", "input.csv"), csv, "utf-8");

		// Switch into the sandbox dir so importer finds ./data/input.csv
		process.chdir(sandboxDir);
	}, 120_000); // extend timeout for container startup & schema push

	afterAll(async () => {
		try {
			// Restore original working directory and remove temp dir
			if (prevCwd) process.chdir(prevCwd);
			if (sandboxDir) rmSync(sandboxDir, { recursive: true, force: true });

			if (server) server.close();
			if (prisma?.$disconnect) await prisma.$disconnect();
		} finally {
			if (container) await container.stop();
			logSpy.mockRestore();
			errSpy.mockRestore();
		}
	});

	// Full CSV import run
	it("imports rows from CSV via /trips and prints summary & stats", async () => {
		// Verify the DB starts empty
		const pre = await request(app).get("/result").send();
		expect(pre.status).toBe(200);
		expect(pre.body).toEqual({
			manufacturers: 0,
			models: 0,
			variants: 0,
			locations: 0,
			trips: 0,
		});

		// Start the importer (this triggers runImporter() on import)
		await import("../src/import/index");

		// Poll helper — repeatedly check /result until counts match expected totals (importer runs asynchronously)
		const waitFor = async <T>(
			fn: () => Promise<T>,
			check: (val: T) => boolean,
			timeoutMs = 10_000,
			intervalMs = 150,
		) => {
			const start = Date.now();
			while (true) {
				try {
					const val = await fn();
					if (check(val)) return val;
				} catch (e: any) {
					// tolerate brief connection resets while server warms up
					if (!/ECONNREFUSED|ECONNRESET|EPIPE/.test(String(e?.code ?? e))) {
						// rethrow other errors
						throw e;
					}
				}
				if (Date.now() - start > timeoutMs) {
					throw new Error("Timed out waiting for importer to finish");
				}
				await new Promise((r) => setTimeout(r, intervalMs));
			}
		};

		// Wait until stats show the expected counts
		await waitFor(
			async () => {
				const res = await request(app).get("/result").send();
				return res;
			},
			(res) =>
				res.status === 200 &&
				res.body &&
				res.body.trips === 2 &&
				res.body.manufacturers === 2 &&
				res.body.models === 2 &&
				res.body.variants === 2 &&
				res.body.locations === 4,
		);

		// Check captured logs for import summary messages
		await new Promise((r) => setTimeout(r, 50));
		const logs = logSpy.mock.calls.map((c) => c.join(" "));
		// We assert “Import summary” appeared and mentions ok=2
		expect(logs.some((l) => /Starting import of CSV file!/i.test(l))).toBe(
			true,
		);
		expect(logs.some((l) => /Import summary:\s*ok=2,\s*fail=0/i.test(l))).toBe(
			true,
		);

		// Final state verification - stats endpoint shows correct totals
		const res = await request(app).get("/result").send();
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			manufacturers: 2,
			models: 2,
			variants: 2,
			locations: 4,
			trips: 2,
		});
	});
});
