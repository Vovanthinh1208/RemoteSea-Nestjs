import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Swagger-only response shapes for the Taxonomy module (categories + skills).
 *
 * The app validates requests with Zod (see ../dto/*.ts) via ZodValidationPipe,
 * not class-validator — these classes exist purely so Swagger can render a
 * typed schema in /docs. They are never imported outside this docs/ folder.
 */

export class CategoryDto {
  @ApiProperty({ example: "clcat1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "Engineering" })
  name!: string;

  @ApiProperty({ example: "engineering" })
  slug!: string;

  @ApiPropertyOptional({ example: "code", nullable: true })
  icon?: string | null;

  @ApiProperty({
    example: 12,
    description: "Live (ACTIVE, not expired) jobs currently in this category.",
  })
  jobCount!: number;
}

export class SkillDto {
  @ApiProperty({ example: "clskl1a2b3c4d5e6f7g8h9i0" })
  id!: string;

  @ApiProperty({ example: "TypeScript" })
  name!: string;

  @ApiProperty({ example: "typescript" })
  slug!: string;
}
