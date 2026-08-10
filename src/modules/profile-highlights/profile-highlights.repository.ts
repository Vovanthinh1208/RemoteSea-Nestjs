import { Injectable } from "@nestjs/common";
import type { ProfileHighlight, ProfileHighlightType } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { CreateProfileHighlightDto } from "./dto/create-profile-highlight.dto";
import type { UpdateProfileHighlightDto } from "./dto/update-profile-highlight.dto";

@Injectable()
export class ProfileHighlightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTalentIdByUserId(userId: string): Promise<{ id: string } | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  countByTalentIdAndType(
    talentId: string,
    type: ProfileHighlightType,
  ): Promise<number> {
    return this.prisma.profileHighlight.count({ where: { talentId, type } });
  }

  findByTalentId(talentId: string): Promise<ProfileHighlight[]> {
    return this.prisma.profileHighlight.findMany({
      where: { talentId },
      orderBy: { createdAt: "asc" },
    });
  }

  create(
    talentId: string,
    data: CreateProfileHighlightDto,
  ): Promise<ProfileHighlight> {
    return this.prisma.profileHighlight.create({ data: { ...data, talentId } });
  }

  findOwnerById(
    id: string,
  ): Promise<{
    id: string;
    talentId: string;
    talent: { userId: string };
  } | null> {
    return this.prisma.profileHighlight.findUnique({
      where: { id },
      select: {
        id: true,
        talentId: true,
        talent: { select: { userId: true } },
      },
    });
  }

  update(
    id: string,
    data: UpdateProfileHighlightDto,
  ): Promise<ProfileHighlight> {
    return this.prisma.profileHighlight.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.profileHighlight.delete({ where: { id } });
  }
}
