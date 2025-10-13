import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendRequest } from "../lib/client";
import { parseCsvToJson } from "../lib/parser";
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

const isMeaningfulRow = (row: any) =>
	row &&
	Object.values(row).some((v) => {
		if (v == null) return false; // null/undefined
		if (typeof v === "number") return true; // a number is meaningful
		const s = String(v).trim();
		return s.length > 0; // non-empty string
	});

const runImporter = async () => {
	console.log("Starting import of CSV file!");

	// 1. Read the CSV file such that each row is part of an array
	const csvPath = resolve(process.cwd(), "data/input.csv");
	const csvString = readFileSync(csvPath, "utf-8");
	const rows = parseCsvToJson(csvString);

	let success = 0,
		fail = 0; // for quick import summary

	// 2. Iterate over the array and process each row asynchronously
	for (const row of rows) {
		if (!isMeaningfulRow(row)) continue; // skip trailing/empty CSV rows
		try {
			// console.log(row);
			// 3. Consume the `/POST` endpoint of your main entity to save each row
			await sendRequest(`${BASE}/trips`, "POST", row);
			success++;
		} catch (e: any) {
			fail++;
			console.error("Row failed:", e?.message ?? e);
		}
	}
	// 4. Finally, output the number of all imported entities by consuming a `/GET` endpoint for stats
	const stats = await sendRequest(`${BASE}/result`);
	console.log(`Import summary: ok=${success}, fail=${fail}`);
	console.log("Entity counts:", JSON.stringify(stats.data, null, 2));
};

runImporter();
