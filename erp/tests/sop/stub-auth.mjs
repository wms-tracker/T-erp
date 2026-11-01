export const db = globalThis.__sopDbs[new URL(import.meta.url).searchParams.get('u')];
