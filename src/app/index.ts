import express, { type Express } from "express";
import { ResultRouter } from "./result/router";
import { TripRouter } from "./trips/router";
import "dotenv/config";

const port = Number(process.env.PORT ?? 3000);

export const server: Express = express();
server.use(express.json());
server.use("/result", ResultRouter);
server.use("/trips", TripRouter);

// Error handling middleware
server.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal Server Error" });
});

server.listen(port, () => {
	console.log(`Listening on port ${port}`);
});
