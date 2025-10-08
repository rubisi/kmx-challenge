import { request } from "undici";

export const sendRequest = async (requestUrl: string) => {
	const { statusCode, headers, body } = await request(requestUrl);
	const data = await body.json();

	return { data, statusCode, headers };
};
