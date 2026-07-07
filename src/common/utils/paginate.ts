import type { Pagination } from "@/common/interfaces/pagination.interface";

export function paginationSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}
