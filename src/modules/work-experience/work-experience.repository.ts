import { Injectable } from "@nestjs/common";
import type { WorkExperience } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { CreateWorkExperienceDto } from "./dto/create-work-experience.dto";
import type { UpdateWorkExperienceDto } from "./dto/update-work-experience.dto";

@Injectable()
export class WorkExperienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTalentIdByUserId(userId: string): Promise<{ id: string } | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  countByTalentId(talentId: string): Promise<number> {
    return this.prisma.workExperience.count({ where: { talentId } });
  }

  // Current roles (endDate: null) first, then most-recently-started first —
  // matches the reference design's manually-ordered sample data without
  // needing a separate manual sort-order field.
  findByTalentId(talentId: string): Promise<WorkExperience[]> {
    return this.prisma.workExperience.findMany({
      where: { talentId },
      orderBy: [
        { endDate: { sort: "desc", nulls: "first" } },
        { startDate: "desc" },
      ],
    });
  }

  create(
    talentId: string,
    data: CreateWorkExperienceDto,
  ): Promise<WorkExperience> {
    return this.prisma.workExperience.create({ data: { ...data, talentId } });
  }

  findOwnerById(
    id: string,
  ): Promise<{
    id: string;
    talentId: string;
    talent: { userId: string };
  } | null> {
    return this.prisma.workExperience.findUnique({
      where: { id },
      select: {
        id: true,
        talentId: true,
        talent: { select: { userId: true } },
      },
    });
  }

  update(id: string, data: UpdateWorkExperienceDto): Promise<WorkExperience> {
    return this.prisma.workExperience.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workExperience.delete({ where: { id } });
  }
}
