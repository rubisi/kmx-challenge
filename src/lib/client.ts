import { request } from "undici";

export const sendRequest = async (
  requestUrl: string,
  method: string = "GET",
  jsonBody?: unknown
) => {
  const { statusCode, headers, body } = await request(requestUrl, {
    method,
    headers: { "content-type": "application/json" },
    body: jsonBody != null ? JSON.stringify(jsonBody) : null,
  });

  // Read the response body as text
  let data: unknown;
  const text = await body.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text; // If not JSON, return as plain text
  }

  // Handle HTTP errors
  if (statusCode >= 400) {
    throw new Error(
      `HTTP ${statusCode}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );
  }

  return { data, statusCode, headers };
};