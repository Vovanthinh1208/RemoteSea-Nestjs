export interface SalaryBenchmark {
  role: string;
  min: number;
  max: number;
  mid: number;
  count: number;
}

export interface SalaryBenchmarkBySeniority {
  role: string;
  level: string;
  min: number;
  max: number;
  mid: number;
  count: number;
}

export interface SalaryBenchmarkByCountry {
  country: string;
  min: number;
  max: number;
  mid: number;
  count: number;
}
