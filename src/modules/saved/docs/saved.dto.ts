import { ApiProperty } from "@nestjs/swagger";

/**
 * Swagger-only request/response shapes for the Saved Jobs module.
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

class SavedJobEmployerSummaryDto {
  @ApiProperty({ example: "Acme Corp" })
  companyName!: string;

  @ApiProperty({ example: true })
  isVerified!: boolean;
}

// The embedded job is the same narrow "job card" shape GET /jobs returns per
// list item (see jobListItemSelect) — key fields sketched here for /docs.
class SavedJobEmbeddedJobDto {
  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  id!: string;

  @ApiProperty({ example: "Senior Backend Engineer" })
  title!: string;

  @ApiProperty({ example: 2000, nullable: true })
  salaryMin!: number | null;

  @ApiProperty({ example: 4000, nullable: true })
  salaryMax!: number | null;

  @ApiProperty({ example: true })
  isRemote!: boolean;

  @ApiProperty({ example: "VN", nullable: true })
  country!: string | null;

  @ApiProperty({ type: SavedJobEmployerSummaryDto })
  employer!: SavedJobEmployerSummaryDto;
}

export class SavedJobResponseDto {
  @ApiProperty({ example: "cusr1a2b0000ug0h9x1n1a2" })
  userId!: string;

  @ApiProperty({ example: "cjob1a2b0000ug0h9x1n1a2" })
  jobId!: string;

  @ApiProperty({ example: "2026-07-02T09:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ type: SavedJobEmbeddedJobDto })
  job!: SavedJobEmbeddedJobDto;
}

export class ToggleSavedResponseDto {
  @ApiProperty({
    example: true,
    description: "true if the job is now saved, false if it was just un-saved",
  })
  saved!: boolean;
}
