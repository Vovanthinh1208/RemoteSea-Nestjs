import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ValidationApiException } from "@/common/exceptions/api.exception";

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationApiException(result.error.flatten());
    }
    return result.data;
  }
}
