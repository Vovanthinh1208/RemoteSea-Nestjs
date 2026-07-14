import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { TaxonomyRepository } from "./taxonomy.repository";
import { getOrSetCache } from "@/common/caching/cache.util";

// Categories/skills are an admin-managed taxonomy, not user-generated data — they
// change essentially never, so this is a purely additive win with no real staleness
// cost. Same TTL tier as salary benchmarks (also "rarely changes" data).
const CATEGORIES_CACHE_KEY = "taxonomy:categories";
const TAXONOMY_CACHE_TTL_MS = 300_000;

@Injectable()
export class TaxonomyService {
  constructor(
    private readonly taxonomyRepository: TaxonomyRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  listCategories() {
    return getOrSetCache(
      this.cache,
      CATEGORIES_CACHE_KEY,
      TAXONOMY_CACHE_TTL_MS,
      () => this.taxonomyRepository.findAllCategories(),
    );
  }

  listSkills(q?: string) {
    // Keyed per search string (capped result set, take: 100 in the repository) —
    // unlike categories/benchmarks this isn't a single flat key, since the result
    // genuinely varies by query.
    const cacheKey = `taxonomy:skills:${q ?? ""}`;
    return getOrSetCache(this.cache, cacheKey, TAXONOMY_CACHE_TTL_MS, () =>
      this.taxonomyRepository.findSkills(
        q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      ),
    );
  }
}
