import { applyDecorators } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { InternalServerErrorApiResponse } from "@/core/swagger/common.responses";
import { CategoryDto, SkillDto } from "./taxonomy.dto";
import {
  ListCategoriesResponseExample,
  ListSkillsResponseExample,
} from "./taxonomy.examples";
import { ValidationErrorResponse } from "./taxonomy.responses";

/** Shared tag for both CategoriesController and SkillsController so they group together in Swagger UI. */
export const ApiTaxonomyTag = () => applyDecorators(ApiTags("Taxonomy"));

export const ApiListCategories = () =>
  applyDecorators(
    ApiOperation({
      summary: "List job categories",
      description:
        "Lists all job categories, alphabetically by name, no pagination. No authentication required.",
    }),
    ApiOkResponse({
      description: "Categories",
      type: [CategoryDto],
      schema: { example: ListCategoriesResponseExample },
    }),
    InternalServerErrorApiResponse,
  );

export const ApiListSkills = () =>
  applyDecorators(
    ApiOperation({
      summary: "List skills",
      description:
        "Lists skills, optionally filtered by a case-insensitive substring match on `name`; capped at 100 results, ordered alphabetically. No authentication required.",
    }),
    ApiQuery({
      name: "q",
      required: false,
      type: String,
      description:
        "Case-insensitive substring match on skill name (trimmed). Empty/omitted returns all up to 100.",
      example: "type",
    }),
    ApiOkResponse({
      description: "Skills",
      type: [SkillDto],
      schema: { example: ListSkillsResponseExample },
    }),
    ValidationErrorResponse,
    InternalServerErrorApiResponse,
  );
