import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { nanoid } from "nanoid";
import { AuthRepository } from "./auth.repository";
import { AuthMapper } from "./auth.mapper";
import { RESET_TOKEN_TTL_MS } from "./constants";
import type { RegisterDto } from "./dto/register.dto";
import type { RegisteredUser, OAuthProfile } from "./interfaces";
import { EmailService } from "@/common/services/email.service";
import { slugify } from "@/common/utils/slugify";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";
import {
  BadRequestApiException,
  ConflictApiException,
  UnauthorizedApiException,
} from "@/common/exceptions/api.exception";
import type { AuthenticatedUser, JwtPayload } from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService
  ) {}

  async register(dto: RegisterDto): Promise<RegisteredUser> {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictApiException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.authRepository.createUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
      talentSlug: dto.role === "TALENT" ? `${slugify(dto.name)}-${nanoid(6)}` : undefined,
    });

    await this.emailService.sendWelcomeEmail(user.email, user.name ?? "there");

    return user;
  }

  async validateCredentials(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user?.passwordHash) {
      throw new UnauthorizedApiException("Invalid email or password");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedApiException("Invalid email or password");
    }
    return AuthMapper.toAuthenticatedUser(user);
  }

  issueToken(user: AuthenticatedUser): { accessToken: string } {
    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    return { accessToken: this.jwtService.sign(payload) };
  }

  async validateOAuthLogin(profile: OAuthProfile): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findOrCreateOAuthUser(profile);
    return AuthMapper.toAuthenticatedUser(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) return;

    const token = crypto.randomBytes(32).toString("hex");
    await this.authRepository.createVerificationToken(
      email,
      token,
      new Date(Date.now() + RESET_TOKEN_TTL_MS)
    );
    await this.emailService.sendPasswordResetEmail(email, token);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.authRepository.findVerificationToken(token);
    if (!record || record.expires < new Date()) {
      throw new BadRequestApiException("Invalid or expired token");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await this.authRepository.consumePasswordReset(record.identifier, token, passwordHash);
  }
}
