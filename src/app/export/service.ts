import { prisma } from "../../lib/prisma";

export type ExportTable =
	| "trips"
	| "manufacturers"
	| "vehicleModels"
	| "vehicleVariants"
	| "locations";

type Order = "asc" | "desc";

// Input payload for CSV export
export type ExportRequest = {
	table: ExportTable; // which table to export
	fields?: string[]; // optional list of columns to include (defaults to table preset)
	limit?: number; // max number of rows to export (default 1000, hard cap 10,000)
	order?: Order; // sort order, defaults to "desc" by id
	filters?: Partial<{
		// supported only for trips for now
		date_from: string; // "YYYY-MM-DD" or "DD/MM/YYYY"
		date_to: string; // "YYYY-MM-DD" or "DD/MM/YYYY"
		manufacturer: string;
		model: string;
		origin_country: string;
		destination_country: string;
	}>;
};

const DEFAULT_LIMIT = 1000;
// Absolute upper bound to avoid huge downloads
const HARD_CAP = 10_000 as const;

// Preset columns for each table
// Only fields present here can be exported
const presets: Record<ExportTable, string[]> = {
	trips: [
		"id",
		"tripDate",
		"distanceKm",
		"co2_g_per_km",
		"grid_intensity_gco2_per_kwh",
		"vehicleVariantId",
		"originId",
		"destinationId",
		"createdAt",
		"updatedAt",
	],
	manufacturers: ["id", "name", "createdAt", "updatedAt"],
	vehicleModels: [
		"id",
		"manufacturerId",
		"name",
		"bodyType",
		"segment",
		"createdAt",
		"updatedAt",
	],
	vehicleVariants: [
		"id",
		"modelId",
		"batteryKwh",
		"rangeKm",
		"chargingType",
		"priceEur",
		"createdAt",
		"updatedAt",
	],
	locations: ["id", "city", "country", "createdAt", "updatedAt"],
};

export class ExportService {
	// Generate a CSV for the requested table/fields/filters
	async exportCsv(
		args: ExportRequest,
	): Promise<{ filename: string; csv: string }> {
		const { table, fields, limit, order, filters } = args ?? {};
		if (!table) throw new Error("Missing 'table'");
		if (!(table in presets)) throw new Error(`Unsupported table: ${table}`);

		// Choose columns: requested (if provided) otherwise the table preset
		const columns = (fields?.length ? fields : presets[table]) as string[];

		// Validate requested fields against the allowlist for the table
		const allowed = new Set(presets[table]);
		for (const f of columns) {
			if (!allowed.has(f)) throw new Error(`Unknown field for ${table}: ${f}`);
		}

		// Apply sensible limits and a hard cap
		const take = Math.min(
			Math.max(Number(limit || DEFAULT_LIMIT), 1),
			HARD_CAP,
		);

		const ord: Order = order === "asc" ? "asc" : "desc";

		let rows: any[] = [];

		// Route to the correct Prisma model, applying selection, order, and limit.
		if (table === "trips") {
			const where = buildTripWhere(filters);
			rows = await prisma.trip.findMany({
				where, // filters only apply to trips
				select: toSelect(columns),
				orderBy: { id: ord },
				take,
			});
		} else if (table === "manufacturers") {
			rows = await prisma.manufacturer.findMany({
				select: toSelect(columns),
				orderBy: { id: ord },
				take,
			});
		} else if (table === "vehicleModels") {
			rows = await prisma.vehicleModel.findMany({
				select: toSelect(columns),
				orderBy: { id: ord },
				take,
			});
		} else if (table === "vehicleVariants") {
			rows = await prisma.vehicleVariant.findMany({
				select: toSelect(columns),
				orderBy: { id: ord },
				take,
			});
		} else if (table === "locations") {
			rows = await prisma.location.findMany({
				select: toSelect(columns),
				orderBy: { id: ord },
				take,
			});
		} else {
			// Should never happen due to earlier guard
			throw new Error(`Unsupported table: ${table}`);
		}

		// Normalize values for CSV (dates, Decimals, nulls)
		const normalized = rows.map(normalizeRow);
		// Serialize to CSV with header row
		const csv = toCsv(columns, normalized);
		const filename = `${table}-export.csv`;

		return { filename, csv };
	}
}

// --- HELPER FUNCTIONS ---

// Convert array of column names to Prisma select object
function toSelect(cols: string[]) {
	return Object.fromEntries(cols.map((c) => [c, true])) as any; // e.g. ["id","name"] -> { id: true, name: true }
}

// Parse date strings in "YYYY-MM-DD" or "DD/MM/YYYY" format (or let JS parse it)
function parseDate(input?: string): Date | undefined {
	if (!input) return undefined;
	const s = input.trim();

	const m1 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); // DD/MM/YYYY
	if (m1) {
		const dd = m1[1]!;
		const mm = m1[2]!;
		const yyyy = m1[3]!;
		return new Date(Date.UTC(+yyyy, +mm - 1, +dd, 0, 0, 0));
	}

	const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); // YYYY-MM-DD
	if (m2) {
		const yyyy = m2[1]!;
		const mm = m2[2]!;
		const dd = m2[3]!;
		return new Date(Date.UTC(+yyyy, +mm - 1, +dd, 0, 0, 0));
	}

	// Let JS parse it
	const d = new Date(s);
	if (isNaN(d.getTime())) return undefined;

	return new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0),
	);
}

// Build Prisma "where" filter for trips based on provided filters
function buildTripWhere(filters: ExportRequest["filters"]) {
	if (!filters) return undefined;
	const where: any = {};

	// Trip date range
	const gte = parseDate(filters.date_from);
	const lte = parseDate(filters.date_to);
	if (gte || lte) {
		where.tripDate = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
	}

	// Manufacturer / model name filters through related model relations.
	if (filters.manufacturer || filters.model) {
		where.vehicleVariant = {
			...(where.vehicleVariant ?? {}),
			model: {
				...(where.vehicleVariant?.model ?? {}),
				...(filters.manufacturer
					? {
							manufacturer: {
								name: { contains: filters.manufacturer, mode: "insensitive" },
							},
						}
					: {}),
				...(filters.model
					? { name: { contains: filters.model, mode: "insensitive" } }
					: {}),
			},
		};
	}

	// Origin / destination country (string contains, case-insensitive)
	if (filters.origin_country) {
		where.origin = {
			country: { contains: filters.origin_country, mode: "insensitive" },
		};
	}
	if (filters.destination_country) {
		where.destination = {
			country: { contains: filters.destination_country, mode: "insensitive" },
		};
	}

	return where;
}

// Normalize DB row values for CSV export
function normalizeRow(row: Record<string, any>) {
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(row)) {
		// null/undefined -> empty string
		if (v == null) out[k] = "";
		// Prisma Decimal support -> number
		else if (typeof v === "object" && typeof (v as any).toNumber === "function")
			out[k] = (v as any).toNumber();
		// Date -> ISO string
		else if (v instanceof Date) out[k] = v.toISOString();
		else out[k] = v;
	}
	return out;
}

// Convert an array of objects into CSV with the provided header order
function toCsv(headers: string[], rows: Record<string, any>[]) {
	const esc = (val: any) => {
		const s = String(val ?? "");
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const lines = [
		headers.join(","),
		...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
	];
	return lines.join("\n");
}
