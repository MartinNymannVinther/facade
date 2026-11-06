/**
 * The whole database schema, one file per area. drizzle-kit reads this
 * module; the application imports it as `@/core/db/schema`.
 *
 * Every domain table carries `org_id`, forced RLS, an audit trigger and an
 * isolation test (CONTRIBUTING.md). The foundation tables belong to Better
 * Auth, the audit log and admission; see docs/adr/0001 to 0004.
 */
export * from "./foundation";
export * from "./projects";
export * from "./conversation";
export * from "./agents";
export * from "./ai";
export * from "./demo";
