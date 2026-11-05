"use server";

import { z } from "zod";
import { runAction } from "@/core/action";
import { createProject, ProjectFields, setProjectArchived, updateProject } from "./service";

const Id = z.string().min(1).max(100);

export async function createProjectAction(raw: unknown) {
  return runAction(raw, ProjectFields, createProject);
}

export async function updateProjectAction(raw: unknown) {
  const schema = ProjectFields.partial().extend({ id: Id });
  return runAction(raw, schema, (ctx, { id, ...fields }) => updateProject(ctx, id, fields));
}

export async function setProjectArchivedAction(raw: unknown) {
  const schema = z.object({ id: Id, archived: z.boolean() });
  return runAction(raw, schema, (ctx, i) => setProjectArchived(ctx, i.id, i.archived), ["/"]);
}
