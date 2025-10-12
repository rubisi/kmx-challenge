import type { NextFunction, Request, Response } from "express";
import { TripService } from "./service";

const service = new TripService();

export const TripController = {
    // GET /trips
  getTrips: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query;
      const result = await service.getTrips(Number(page), Number(limit));
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
};