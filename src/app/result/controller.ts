import type { NextFunction, Request, Response } from "express";
import { ResultService } from "./service";

const makeResultController = (service: ResultService) => ({
	getEntityStatistics: (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(service.getEntityStatistics());
		} catch (e) {
			next(e);
		}
	},

	getExampleStatistics: (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(service.getExampleStatistics());
		} catch (e) {
			next(e);
		}
	},
});

export const ResultController = makeResultController(new ResultService());
