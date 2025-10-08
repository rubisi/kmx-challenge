import express from "express";
import request from "supertest";
import { ResultRouter } from "../src/app/result/router";

describe("Result", () => {
	const app = express();
	app.use(express.json());
	app.use("/result", ResultRouter);

	const agent = request.agent(app);

	// Define Testcontainers here to mock your Postgres instance for testing purposes only

	it("fetches the example result statistics for fictional entities", async () => {
		const result = await agent
			.get("/result/example")
			.set("Accept", "application/json")
			.send();

		expect(result.body).toEqual({
			vehicles: 100,
			routes: 72,
			locations: 42,
		});
	});

	it.skip("fetches the real result statistics for database-specific entities", async () => {
		// TODO: Write your test case here
	});
});
