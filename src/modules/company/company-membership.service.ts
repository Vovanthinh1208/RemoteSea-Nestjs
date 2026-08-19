import { Injectable } from "@nestjs/common";
import { CompanyMembershipRepository } from "./company-membership.repository";
import type { CompanyMembership } from "./company-membership.interfaces";

// The shared "which company do I belong to, with what role" lookup —
// previously borrowed from TeamService by Jobs/Employer/Interviews, which
// coupled all three to the team-management *feature* module just to reach
// one foundational domain fact. Team, Jobs, Employer, and Interviews now all
// depend on this small leaf module instead of on each other.
@Injectable()
export class CompanyMembershipService {
  constructor(
    private readonly companyMembershipRepository: CompanyMembershipRepository,
  ) {}

  resolveMembership(userId: string): Promise<CompanyMembership | null> {
    return this.companyMembershipRepository.findMembership(userId);
  }
}
