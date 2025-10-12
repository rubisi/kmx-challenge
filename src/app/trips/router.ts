import { Router } from "express";
import { TripController } from "./controller";

export const TripRouter: Router = Router()
  .get("/", TripController.getTrips);
