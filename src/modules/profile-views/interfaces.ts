export type ProfileViewDailyCount = {
  /** UTC calendar day, "YYYY-MM-DD". */
  date: string;
  views: number;
};

export type ProfileViewer = {
  /** Null when the viewing employer account isn't linked to a company. */
  company: { name: string; slug: string; logoUrl: string | null } | null;
  viewedAt: Date;
};

export type ProfileViewAnalytics = {
  totalViews: number;
  uniqueViewers: number;
  // PB27 AC2: totals per period, each counted from the start of the UTC day
  // that opens the window (today; last 7 days; last 30 days).
  viewsToday: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  /** Last 30 UTC days, oldest first, zero-filled (PB26 chart). */
  daily: ProfileViewDailyCount[];
  /** PB27 AC3: most recent viewers with the company they view on behalf of. */
  recentViewers: ProfileViewer[];
};

export const EMPTY_PROFILE_VIEW_ANALYTICS: ProfileViewAnalytics = {
  totalViews: 0,
  uniqueViewers: 0,
  viewsToday: 0,
  viewsThisWeek: 0,
  viewsThisMonth: 0,
  daily: [],
  recentViewers: [],
};
