import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendRequest } from "../lib/client";
import { parseCsvToJson } from "../lib/parser";

const runImporter = async () => {
	console.log("Starting import of CSV file!");

	// 1. Read the CSV file such that each row is part of an array
	const csvPath = resolve(process.cwd(), "data/input.csv");
	const csvString = readFileSync(csvPath, "utf-8");
	const rows = parseCsvToJson(csvString);

	// 2. Iterate over the array and process each row asynchronously
	// 3. Consume the `/POST` endpoint of your main entity to save each row
	// 4. (Optional) Finally, output the number of all imported entities by consuming a `/GET` endpoint for stats

	const exampleStats = await sendRequest(
		"http://localhost:3000/result/example",
	);

	console.log(
		`Imported entities: ${JSON.stringify(exampleStats.data, null, 2)}`,
	);
};

runImporter();
