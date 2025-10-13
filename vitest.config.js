import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 120_000,
		hookTimeout: 120_000,
		poolOptions: { threads: { singleThread: true } },
		watchExclude: [
			"generated/**",
			"**/.prisma/**",
			"**/node_modules/**",
			"generated/prisma/**",
		],
	},
});
