import type { NextFunction, Request, Response } from "express";
import { type ExportRequest, ExportService } from "./service";

const makeExportController = (service: ExportService) => ({
	exportCsv: async (
		req: Request<{}, any, ExportRequest>,
		res: Response,
		next: NextFunction,
	) => {
		try {
			// Returns the download filename and the CSV payload as a string
			const { filename, csv } = await service.exportCsv(req.body);
			// Respond with CSV and headers that instruct browsers to download a file
			res
				.status(200)
				.setHeader("Content-Type", "text/csv; charset=utf-8")
				.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
				.send(csv);
		} catch (e: any) {
			const msg = e?.message ?? "Export failed";
			const code = /unsupported|unknown|invalid|field|missing/i.test(msg)
				? 400
				: 500;
			res.status(code);
			next(e);
		}
	},
});

export const ExportController = makeExportController(new ExportService());
