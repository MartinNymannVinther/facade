import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import type { OrgContext } from "@/core/db/tenant";
import { fail, ok, type ActionError, type Result } from "@/core/result";

/**
 * A refusal a service raises on purpose: the caller may not, the id is
 * not this workspace's, the row changed underneath. It carries the word
 * the interface renders and nothing else; every other error is logged
 * and answered with "generic".
 */
export class Refused extends Error {
  constructor(
    readonly code: ActionError,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "Refused";
  }
}

/**
 * The shape of every server action in Facade: resolve the caller's
 * workspace first, validate the input at the boundary, run the service,
 * refresh the pages that show what changed, and answer with a Result —
 * never a stack.
 */
export async function runAction<S extends z.ZodType, T>(
  raw: unknown,
  schema: S,
  fn: (ctx: OrgContext, input: z.infer<S>) => Promise<T>,
  revalidate: string[] = [],
): Promise<Result<T>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  try {
    const data = await fn(ctx, parsed.data as z.infer<S>);
    for (const path of revalidate) revalidatePath(path, "layout");
    return ok(data);
  } catch (error) {
    if (error instanceof Refused) return fail(error.code, error.detail);
    console.error("action failed", error);
    return fail("generic");
  }
}
