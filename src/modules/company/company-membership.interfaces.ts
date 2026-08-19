import type { CompanyMemberRole } from "@prisma/client";

// The one shape every employer-facing module resolves "which company does
// this user act as, and with what role" into. Canonical home for this type —
// modules/team, modules/jobs, modules/employer, and modules/interviews all
// import it from here rather than each defining their own copy.
export type CompanyMembership = { employerId: string; role: CompanyMemberRole };
