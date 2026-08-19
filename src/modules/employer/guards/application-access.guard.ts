import { Injectable } from "@nestjs/common";
import {
  ApplicationOwnershipGuard,
  type ApplicationWithJobOwner,
} from "./application-ownership.guard";

/**
 * Guards the view/message routes on an application (GET/POST messages, GET
 * interview) — same company-role baseline as ApplicationOwnershipGuard, plus
 * a bypass for the specific INTERVIEWER assigned to this application's
 * interview (Interview.interviewerId), since "access only assigned
 * interviews/candidates" is INTERVIEWER's entire permission model.
 */
@Injectable()
export class ApplicationAccessGuard extends ApplicationOwnershipGuard {
  protected override getAssignedUserId(
    application: ApplicationWithJobOwner,
  ): string | null {
    return application.interview?.interviewerId ?? null;
  }
}
