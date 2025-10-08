import Papa from "papaparse";

export const parseCsvToJson = (csvString: string) => {
	const parsedResult = Papa.parse(csvString, {
		header: true,
		dynamicTyping: true,
	});

	return parsedResult.data;
};
