import express, { type Express } from "express";
import { ResultRouter } from "./result/router";

const port = 3000;

export const server: Express = express();
server.use(express.json());
server.use("/result", ResultRouter);

server.listen(port, () => {
	console.log(`Listening on port ${port}`);
});
