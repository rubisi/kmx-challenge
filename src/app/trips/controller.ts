import type { NextFunction, Request, Response } from "express";
import { TripService } from "./service";

const service = new TripService();

export const TripController = {
	// GET /trips (paginated list)
	getTrips: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { page, limit } = req.query;
			const result = await service.getTrips(Number(page), Number(limit));
			res.json(result);
		} catch (e) {
			next(e);
		}
	},
	// POST /trips (create one trip from a single CSV row)
	createTrip: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const created = await service.createFromCsvRow(req.body);
			res.status(201).json(created);
		} catch (e) {
			next(e);
		}
	},

	// PUT /trips/:id (update Trip by ID)
	updateTrip: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const id = Number(req.params.id);
			const updated = await service.updateTrip(id, req.body);
			res.json(updated);
		} catch (e) {
			next(e);
		}
	},
	// DELETE /trips/:id
	deleteTrip: async (req: Request, res: Response, next: NextFunction) => {
		try {
			const id = Number(req.params.id);
			const result = await service.deleteTrip(id);
			res.json(result);
		} catch (e) {
			next(e);
		}
	},
};
