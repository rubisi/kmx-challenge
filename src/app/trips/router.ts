import { Router } from "express";
import { TripController } from "./controller";

export const TripRouter: Router = Router()
	.get("/", TripController.getTrips)
	.post("/", TripController.createTrip)
	.put("/:id", TripController.updateTrip)
	.delete("/:id", TripController.deleteTrip);
