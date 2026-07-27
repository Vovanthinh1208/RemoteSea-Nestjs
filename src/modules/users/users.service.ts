import { Injectable } from "@nestjs/common";
// Native bcrypt (threadpool) — see auth.service.ts for the bcryptjs rationale.
import * as bcrypt from "bcrypt";
import type { User } from "@prisma/client";
import { UsersRepository } from "./users.repository";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  updateName(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<Pick<User, "id" | "name" | "email">> {
    return this.usersRepository.updateName(userId, dto.name);
  }

  async deleteAccount(userId: string): Promise<void> {
    // jobs.employerId is ON DELETE RESTRICT specifically to make this
    // unconditionally safe — but check first and give a clear, actionable
    // error rather than letting the delete fail with a raw FK-violation.
    // Only ever non-zero for an EMPLOYER-role user (a TALENT has no
    // EmployerProfile, so this is always 0 for them).
    const jobCount = await this.usersRepository.countEmployerJobs(userId);
    if (jobCount > 0) {
      throw new ConflictApiException(
        `Cannot delete account with ${jobCount} active job posting(s) — close or transfer them first`,
        ErrorCode.ACTIVE_JOBS_PREVENT_DELETION,
      );
    }

    await this.usersRepository.deleteUser(userId);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findPasswordHash(userId);
    if (!user?.passwordHash) {
      throw new BadRequestApiException(
        "Password change is not available for social sign-in accounts.",
        ErrorCode.SOCIAL_ACCOUNT_NO_PASSWORD,
      );
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestApiException(
        "Current password is incorrect",
        ErrorCode.CURRENT_PASSWORD_INCORRECT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.updatePasswordHash(userId, passwordHash);

    return { message: "Password updated" };
  }
}
