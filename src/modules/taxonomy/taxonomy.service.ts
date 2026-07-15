import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { TaxonomyRepository } from "./taxonomy.repository";
import { getOrSetCache } from "@/common/caching/cache.util";

// Categories/skills are an admin-managed taxonomy, not user-generated data — they
// change essentially never, so this is a purely additive win with no real staleness
// cost. Same TTL tier as salary benchmarks (also "rarely changes" data).
const CATEGORIES_CACHE_KEY = "taxonomy:categories";
const SKILLS_CACHE_KEY = "taxonomy:skills";
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
    // Only the unfiltered full list is cached. This used to cache per search
    // string (`taxonomy:skills:${q}`), but q is user input on a public endpoint
    // and the default in-memory store only evicts expired entries when they're
    // read again — so every distinct q left a permanent Map entry (unbounded
    // growth), while the only real consumer (the post-job wizard) never sends q
    // at all. Filtered lookups just hit the DB: small table, take: 100.
    if (q) {
      return this.taxonomyRepository.findSkills({
        name: { contains: q, mode: "insensitive" },
      });
    }
    return getOrSetCache(
      this.cache,
      SKILLS_CACHE_KEY,
      TAXONOMY_CACHE_TTL_MS,
      () => this.taxonomyRepository.findSkills(),
    );
  }
}
