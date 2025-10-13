import type { NextFunction, Request, Response } from "express";
import { ResultService } from "./service";

const makeResultController = (service: ResultService) => ({
	getEntityStatistics: async (
		_req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			res.json(await service.getEntityStatistics());
		} catch (e) {
			next(e);
		}
	},
});

export const ResultController = makeResultController(new ResultService());
