import { Router } from "express";
import { ResultController } from "./controller";

export const ResultRouter: Router = Router()
	.get("/statistics", ResultController.getEntityStatistics)
	.get("/example", ResultController.getExampleStatistics);
