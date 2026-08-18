import { z } from "zod";
import {
  JOB_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
  JOB_STATUS_VALUES,
  APPLICATION_STATUS_VALUES,
  PLAN_TYPE_VALUES,
  ALERT_FREQUENCY_VALUES,
  JOB_REPORT_REASON_VALUES,
  JOB_REPORT_STATUS_VALUES,
} from "@/common/constants/enum-values.constants";

export const jobTypeSchema = z.enum(JOB_TYPE_VALUES);
export const experienceLevelSchema = z.enum(EXPERIENCE_LEVEL_VALUES);
export const jobStatusSchema = z.enum(JOB_STATUS_VALUES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUS_VALUES);
export const planTypeSchema = z.enum(PLAN_TYPE_VALUES);
export const alertFrequencySchema = z.enum(ALERT_FREQUENCY_VALUES);
export const jobReportReasonSchema = z.enum(JOB_REPORT_REASON_VALUES);
export const jobReportStatusSchema = z.enum(JOB_REPORT_STATUS_VALUES);
