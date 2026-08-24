/**
 * Ports and origins shared by the Playwright config, the fixture API, and the
 * specs. Kept in its own module so the specs do not have to import the config
 * (which would make the config a dependency of every worker).
 */
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3210);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 4210);

export const webOrigin = `http://127.0.0.1:${WEB_PORT}`;
export const fixtureApiOrigin = `http://127.0.0.1:${API_PORT}`;
