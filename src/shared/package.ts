import { z } from "zod";
import { mapSchema, validateMap } from "./map";
export const campusPackageSchema = z.object({
  format: z.literal("3d-college-campus"),
  version: z.literal(1),
  college: z.string().min(1).max(160),
  projectId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  revision: z.number().int().nonnegative(),
  map: mapSchema,
  demonstration: z.boolean().default(false),
});
export type CampusPackage = z.infer<typeof campusPackageSchema>;
export function parseCampusPackage(input: unknown): CampusPackage {
  const campus = campusPackageSchema.parse(input);
  if (validateMap(campus.map).some((issue) => issue.severity === "error"))
    throw new Error(
      "The installed campus map is incomplete or unverified. Request a new package from the campus owner.",
    );
  return campus;
}
