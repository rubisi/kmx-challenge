import { Router } from "express";
import { ExportController } from "./controller";

export const ExportRouter: Router = Router().post(
	"/",
	ExportController.exportCsv,
);
