import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { UsersRepository } from "./users.repository";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  updateName(userId: string, dto: UpdateUserDto): Promise<Pick<User, "id" | "name" | "email">> {
    return this.usersRepository.updateName(userId, dto.name);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.usersRepository.deleteUser(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findPasswordHash(userId);
    if (!user?.passwordHash) {
      throw new BadRequestApiException("Password change is not available for social sign-in accounts.");
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestApiException("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.updatePasswordHash(userId, passwordHash);

    return { message: "Password updated" };
  }
}
