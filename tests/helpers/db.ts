import { Client, Pool } from "pg";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Superuser pool: fixtures and assertions that must bypass RLS. */
export function adminPool(): Pool {
  return new Pool({ connectionString: requireEnv("MIGRATION_DATABASE_URL"), max: 2 });
}

/** Dedicated client connected as the application role (facade_app). */
export async function appClient(): Promise<Client> {
  const client = new Client({ connectionString: requireEnv("APP_DATABASE_URL") });
  await client.connect();
  return client;
}

/** Dedicated client connected as the auth role (facade_auth). */
export async function authClient(): Promise<Client> {
  const client = new Client({ connectionString: requireEnv("AUTH_DATABASE_URL") });
  await client.connect();
  return client;
}

export type TenantContext = { orgId: string; userId: string } | null;

/**
 * Runs `query` as the application role inside a transaction with (or
 * without) a tenant context, exactly like the app's withOrgContext helper.
 * Always rolls back so tests stay side-effect free.
 */
export async function asApp<T>(
  client: Client,
  context: TenantContext,
  query: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    if (context) {
      await client.query(
        "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)",
        [context.orgId, context.userId],
      );
    }
    return await query(client);
  } finally {
    await client.query("rollback");
  }
}

/** The same as `asApp`, but the write stays: for a row a later assertion has to find. */
export async function asAppCommit<T>(
  client: Client,
  context: TenantContext,
  query: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    if (context) {
      await client.query(
        "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)",
        [context.orgId, context.userId],
      );
    }
    const result = await query(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/** Error code helper: runs the query and returns the Postgres error code. */
export async function expectSqlError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_ERROR";
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = (error as { message?: string }).message ?? "";
    return code ?? message;
  }
}
