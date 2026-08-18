/** Response example payloads for the Salary module's Swagger docs. */

export const ListBenchmarksResponseExample = [
  { role: "Engineering", min: 1800, max: 4200, mid: 3000, count: 12 },
  { role: "Design", min: 1500, max: 3400, mid: 2450, count: 7 },
];

export const ListBenchmarksBySeniorityResponseExample = [
  {
    role: "Engineering",
    level: "SENIOR",
    min: 3200,
    max: 5800,
    mid: 4500,
    count: 5,
  },
  {
    role: "Engineering",
    level: "MID",
    min: 1800,
    max: 3700,
    mid: 2750,
    count: 7,
  },
];

export const ListBenchmarksByCountryResponseExample = [
  { country: "Singapore", min: 2400, max: 6200, mid: 3800, count: 18 },
  { country: "Australia", min: 2800, max: 7500, mid: 4200, count: 14 },
];
