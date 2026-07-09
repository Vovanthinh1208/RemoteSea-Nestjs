import type { Pagination } from "@/common/interfaces/pagination.interface";

export const paginationSkip = (page: number, limit: number): number =>
  (page - 1) * limit;

export const buildPagination = (
  page: number,
  limit: number,
  total: number,
): Pagination => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});
