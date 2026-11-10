import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import PDFDocument from "pdfkit";
import { sanitizePersonalData } from "./personal-data-sanitizer";
import {
  personalDataAccountSchema,
  ExportRenderError,
  ExportTooLargeError,
  type PersonalDataExportPayload,
  type ExportLocale,
} from "./personal-data-contract";
export type {
  PersonalDataExportPayload,
  ExportAccountData,
} from "./personal-data-contract";

const C = {
  ink: "#0F172A",
  secondary: "#475569",
  muted: "#64748B",
  accent: "#2E9B52",
  pale: "#EFF8F1",
  line: "#E2E8F0",
  table: "#F8FAFC",
};
const L = 48,
  W = 499.28,
  TOP = 76,
  BOTTOM = 776;
const COPY = {
  en: {
    cover: "PERSONAL DATA EXPORT REPORT",
    overview: "Account overview",
    account: "Account information",
    profile: "Personal profiles",
    applications: "Application history",
    messages: "Message history",
    notifications: "Notification settings",
    about: "About this export",
    empty: "No records were found for this section at the time of export.",
    property: "Property",
    value: "Value",
    profiles: "Related profiles",
    apps: "Applications",
    msgs: "Messages exported",
    prefs: "Notification options",
    generated: "Generated",
    timezone: "Display time zone",
    scope: "Export scope",
    reference: "Report reference",
    version: "Report format",
    missing: "Not provided",
    yes: "Enabled",
    no: "Disabled",
    active: "Active",
    paused: "Paused",
    banned: "Restricted",
    position: "Position / company",
    status: "Status",
    applied: "Applied",
    updated: "Updated",
    you: "You",
    conversation: "Conversation",
    sent: "Sent",
    confidentiality: "Private personal data",
    page: "Page",
    details: "Additional application details",
    experience: "Work experience",
    highlights: "Education, portfolio & languages",
    skills: "Skills",
    company: "Company profile",
    jobs: "Company job listings",
    alerts: "Job alerts",
    personal: "Personal report",
    notice:
      "This is a copy of personal data assembled at the time of export. It may contain private information and should be stored securely.",
    policy:
      "This report contains personal data supplied within the supported export scope at creation time. Store it securely and do not share it with anyone who is not authorized to access it.",
    bounds:
      "The PDF is a readable record of the supported fields, not a certified or legally exhaustive archive. JSON remains available for machine-readable storage. External images, CVs and attachments are not downloaded or embedded.",
    messageScope:
      "Only messages authored by you in currently authorized application conversations are exported. Incoming messages and other participants' contact details are excluded under the existing export policy.",
    consistency:
      "The data was read in a read-only, repeatable-read database snapshot. Changes made after the snapshot began are not included.",
    exclusions:
      "Excluded: account credentials and sessions; employer-private notes, scorecards and AI evaluations; other users' data. Saved jobs, reviews, interview files and AI conversation history are outside this export's current scope.",
    accountStatus: "Account status",
    noPrefs:
      "No stored notification-preference record exists. No default preference values have been invented.",
    noCert:
      "There is no separate certification model in the current schema. Education, portfolio and language entries are shown exactly as recorded.",
    scopeSummary:
      "Account, own profiles, own applications, authored messages and stored notification settings. Available job alerts and your company's public job listings are also included.",
  },
  vi: {
    cover: "BÁO CÁO DỮ LIỆU CÁ NHÂN",
    overview: "Tổng quan tài khoản",
    account: "Thông tin tài khoản",
    profile: "Hồ sơ cá nhân",
    applications: "Lịch sử ứng tuyển",
    messages: "Lịch sử tin nhắn",
    notifications: "Cài đặt thông báo",
    about: "Thông tin về bản xuất",
    empty: "Không có bản ghi cho mục này tại thời điểm xuất báo cáo.",
    property: "Thuộc tính",
    value: "Giá trị",
    profiles: "Hồ sơ liên quan",
    apps: "Đơn ứng tuyển",
    msgs: "Tin nhắn trong bản xuất",
    prefs: "Tùy chọn thông báo",
    generated: "Thời điểm xuất",
    timezone: "Múi giờ hiển thị",
    scope: "Phạm vi dữ liệu",
    reference: "Mã tham chiếu",
    version: "Phiên bản báo cáo",
    missing: "Chưa cung cấp",
    yes: "Bật",
    no: "Tắt",
    active: "Đang hoạt động",
    paused: "Tạm dừng",
    banned: "Bị hạn chế",
    position: "Vị trí / công ty",
    status: "Trạng thái",
    applied: "Ngày ứng tuyển",
    updated: "Ngày cập nhật",
    you: "Bạn",
    conversation: "Hội thoại",
    sent: "Thời điểm gửi",
    confidentiality: "Dữ liệu cá nhân riêng tư",
    page: "Trang",
    details: "Chi tiết bổ sung của đơn ứng tuyển",
    experience: "Kinh nghiệm làm việc",
    highlights: "Học vấn, portfolio và ngôn ngữ",
    skills: "Kỹ năng",
    company: "Hồ sơ công ty",
    jobs: "Tin tuyển dụng của công ty",
    alerts: "Cảnh báo việc làm",
    personal: "Bản lưu cá nhân",
    notice:
      "Đây là bản sao dữ liệu cá nhân được hệ thống tổng hợp tại thời điểm xuất báo cáo. Nội dung có thể chứa thông tin riêng tư và cần được lưu trữ an toàn.",
    policy:
      "Báo cáo này chứa dữ liệu cá nhân được hệ thống cung cấp theo phạm vi xuất tại thời điểm tạo. Vui lòng lưu trữ an toàn và không chia sẻ với người không có quyền truy cập.",
    bounds:
      "PDF trình bày các trường dữ liệu được hỗ trợ; không phải chứng nhận hay bản lưu trữ đầy đủ tuyệt đối về mặt pháp lý. JSON vẫn được cung cấp để lưu trữ dữ liệu máy đọc được. Không tải hoặc nhúng ảnh, CV hay tệp đính kèm bên ngoài.",
    messageScope:
      "Chỉ xuất tin nhắn do chính bạn gửi trong các hội thoại ứng tuyển hiện được phép truy cập. Không xuất tin nhắn nhận được hoặc thông tin liên hệ của người tham gia khác theo chính sách xuất hiện có.",
    consistency:
      "Dữ liệu được đọc trong một snapshot cơ sở dữ liệu chỉ đọc với mức cô lập repeatable-read. Không bao gồm thay đổi phát sinh sau khi bắt đầu snapshot.",
    exclusions:
      "Loại trừ: thông tin xác thực và phiên đăng nhập; ghi chú, phiếu đánh giá và phân tích AI nội bộ của nhà tuyển dụng; dữ liệu người khác. Việc đã lưu, đánh giá, tệp phỏng vấn và lịch sử hội thoại AI chưa thuộc phạm vi xuất hiện tại.",
    accountStatus: "Trạng thái tài khoản",
    noPrefs:
      "Chưa có bản ghi cài đặt thông báo được lưu. Báo cáo không tự tạo giá trị mặc định.",
    noCert:
      "Schema hiện tại không có model chứng chỉ riêng. Học vấn, portfolio và ngôn ngữ được hiển thị đúng theo dữ liệu đã lưu.",
    scopeSummary:
      "Tài khoản, hồ sơ của bạn, đơn ứng tuyển, tin nhắn đã gửi và cài đặt thông báo đã lưu. Bao gồm cảnh báo việc làm hiện có và tin tuyển dụng công khai của công ty do bạn sở hữu.",
  },
} as const;
const LABELS: Record<string, [string, string]> = {
  name: ["Full name", "Họ và tên"],
  email: ["Email", "Email"],
  phone: ["Phone", "Số điện thoại"],
  role: ["Account role", "Vai trò tài khoản"],
  language: ["Preferred language", "Ngôn ngữ ưu tiên"],
  region: ["Region", "Khu vực"],
  currencyDisplay: ["Display currency", "Tiền tệ hiển thị"],
  emailVerified: ["Email verified", "Email đã xác minh"],
  createdAt: ["Created", "Ngày tạo"],
  updatedAt: ["Updated", "Ngày cập nhật"],
  headline: ["Headline", "Chức danh"],
  bio: ["About", "Giới thiệu"],
  location: ["Location", "Địa điểm"],
  country: ["Country", "Quốc gia"],
  timezone: ["Profile time zone", "Múi giờ hồ sơ"],
  yearsExperience: ["Years of experience", "Số năm kinh nghiệm"],
  level: ["Seniority", "Cấp bậc"],
  resumeUrl: ["CV link (file not embedded)", "Liên kết CV (không nhúng tệp)"],
  portfolioUrl: ["Portfolio link", "Liên kết portfolio"],
  githubUrl: ["GitHub", "GitHub"],
  linkedinUrl: ["LinkedIn", "LinkedIn"],
  isOpenToWork: ["Open to work", "Đang tìm việc"],
  visibility: ["Profile visibility", "Hiển thị hồ sơ"],
  desiredSalaryMin: ["Desired minimum salary", "Lương mong muốn tối thiểu"],
  desiredSalaryMax: ["Desired maximum salary", "Lương mong muốn tối đa"],
  currency: ["Currency", "Tiền tệ"],
  primaryRole: ["Preferred role", "Vị trí mong muốn"],
  rightToWork: ["Right to work", "Quyền làm việc"],
  noticePeriod: ["Notice period", "Thời gian báo trước"],
  employmentTypes: ["Employment types", "Loại công việc"],
  timezoneOverlap: ["Time-zone overlap", "Khung giờ làm việc"],
  company: ["Company", "Công ty"],
  title: ["Title", "Chức danh"],
  startDate: ["Start date", "Ngày bắt đầu"],
  endDate: ["End date", "Ngày kết thúc"],
  description: ["Description", "Mô tả"],
  subtitle: ["Details", "Thông tin bổ sung"],
  tag: ["Category", "Phân loại"],
  url: ["Link", "Liên kết"],
  startYear: ["Start year", "Năm bắt đầu"],
  endYear: ["End year", "Năm kết thúc"],
  type: ["Type", "Loại"],
  companyName: ["Company name", "Tên công ty"],
  websiteUrl: ["Website", "Website"],
  industry: ["Industry", "Ngành nghề"],
  size: ["Company size", "Quy mô công ty"],
  founded: ["Founded", "Năm thành lập"],
  hqCountry: ["HQ country", "Quốc gia trụ sở"],
  hqCity: ["HQ city", "Thành phố trụ sở"],
  hqAddress: ["HQ address", "Địa chỉ trụ sở"],
  benefits: ["Benefits", "Phúc lợi"],
  facebookUrl: ["Facebook", "Facebook"],
  videoUrl: ["Video link", "Liên kết video"],
  isVerified: ["Verified", "Đã xác minh"],
  coverLetter: ["Submitted cover letter", "Thư ứng tuyển đã gửi"],
  contactPhone: ["Submitted phone", "Số điện thoại đã gửi"],
  viewedAt: ["Viewed", "Thời điểm được xem"],
  rejectionReason: ["Applicant-visible feedback", "Phản hồi cho ứng viên"],
  offerSalary: ["Offer salary", "Lương đề nghị"],
  offerBenefits: ["Offer benefits", "Phúc lợi đề nghị"],
  offerStartDate: ["Offer start date", "Ngày bắt đầu đề nghị"],
  offerDeclineReason: [
    "Your offer-decline reason",
    "Lý do từ chối offer của bạn",
  ],
  applicationUpdates: ["Application updates", "Cập nhật đơn ứng tuyển"],
  employerMessages: ["Employer messages", "Tin nhắn nhà tuyển dụng"],
  weeklyDigest: ["Weekly digest", "Tổng hợp hàng tuần"],
  instantMatchAlerts: [
    "Instant matching-job alerts",
    "Cảnh báo việc làm phù hợp",
  ],
  productNews: ["Product news", "Tin sản phẩm"],
  tipsAndResources: ["Tips and resources", "Mẹo và tài nguyên"],
  browserPush: ["Browser push notifications", "Thông báo trên trình duyệt"],
  keywords: ["Keywords", "Từ khóa"],
  jobType: ["Job type", "Loại việc làm"],
  salaryMin: ["Minimum salary", "Lương tối thiểu"],
  frequency: ["Frequency", "Tần suất"],
  isActive: ["Active", "Đang bật"],
  lastSentAt: ["Last sent", "Lần gửi gần nhất"],
  categories: ["Categories", "Ngành nghề"],
  slug: ["Public profile slug", "Định danh hồ sơ công khai"],
  verifiedAt: ["Verified at", "Thời điểm xác minh"],
  suspendedAt: ["Suspended at", "Thời điểm đình chỉ"],
  pausedAt: ["Paused at", "Thời điểm tạm dừng"],
  bannedAt: ["Restricted at", "Thời điểm hạn chế"],
  image: ["Avatar link (not embedded)", "Liên kết ảnh (không nhúng)"],
  logoUrl: ["Logo link (not embedded)", "Liên kết logo (không nhúng)"],
  coverImageUrl: ["Cover image link", "Liên kết ảnh bìa"],
};
const STATUSES: Record<string, [string, string]> = {
  APPLIED: ["Applied", "Đã ứng tuyển"],
  REVIEWING: ["Under review", "Đang xem xét"],
  SHORTLISTED: ["Shortlisted", "Vào danh sách chọn"],
  INTERVIEW: ["Interview", "Phỏng vấn"],
  INTERVIEWED: ["Interviewed", "Đã phỏng vấn"],
  OFFERED: ["Offer received", "Đã nhận đề nghị"],
  ACCEPTED: ["Accepted", "Đã chấp nhận"],
  REJECTED: ["Rejected", "Đã từ chối"],
  WITHDRAWN: ["Withdrawn", "Đã rút"],
  DECLINED: ["Declined", "Đã từ chối đề nghị"],
  ACTIVE: ["Active", "Đang tuyển"],
  DRAFT: ["Draft", "Bản nháp"],
  PENDING_REVIEW: ["Pending review", "Chờ duyệt"],
  CLOSED: ["Closed", "Đã đóng"],
  EXPIRED: ["Expired", "Hết hạn"],
};

/** Layout primitives deliberately render plain text, never HTML or fetched URLs. */
class Report {
  y = TOP;
  section = "";
  pages = 0;
  readonly started = performance.now();
  readonly t;
  readonly column: 0 | 1;
  constructor(
    readonly doc: InstanceType<typeof PDFDocument>,
    readonly locale: ExportLocale,
    readonly ref: string,
  ) {
    this.t = COPY[locale];
    this.column = locale === "vi" ? 1 : 0;
  }
  guard() {
    if (this.pages > 200)
      throw new ExportTooLargeError(
        "PDF exceeds 200 pages; request JSON instead",
      );
    if (performance.now() - this.started > 15_000)
      throw new ExportRenderError("PDF render deadline exceeded");
  }
  page(section: string, cover = false) {
    this.guard();
    this.doc.addPage();
    this.pages++;
    this.section = section;
    this.y = TOP;
    if (!cover) {
      this.doc
        .font("Bold")
        .fontSize(10)
        .fillColor(C.accent)
        .text("REMOTESEA", L, 32, { lineBreak: false });
      this.doc
        .font("Regular")
        .fontSize(8)
        .fillColor(C.muted)
        .text(section, L + 130, 34, {
          width: W - 130,
          align: "right",
          lineBreak: false,
        });
      this.doc
        .moveTo(L, 53)
        .lineTo(L + W, 53)
        .strokeColor(C.line)
        .lineWidth(0.7)
        .stroke();
    }
  }
  heading(title: string) {
    this.space(44);
    this.doc
      .font("Bold")
      .fontSize(18)
      .fillColor(C.ink)
      .text(title, L, this.y, { width: W });
    this.y += 35;
  }
  sub(title: string) {
    const height = this.height(title, W, 12, "Bold");
    if (height > 200) {
      this.block(title, C.ink, 12);
      return;
    }
    this.space(height + 14);
    this.doc
      .font("Bold")
      .fontSize(12)
      .fillColor(C.ink)
      .text(title, L, this.y, { width: W });
    this.y += height + 9;
  }
  space(height: number) {
    this.guard();
    if (this.y + height > BOTTOM) this.page(this.section);
  }
  height(value: string, width: number, size = 10, font = "Regular") {
    return this.doc
      .font(font)
      .fontSize(size)
      .heightOfString(value || " ", { width, lineGap: 3 });
  }
  fit(
    value: string,
    width: number,
    height: number,
    size = 10,
    font = "Regular",
  ) {
    if (!value) return ["", ""] as const;
    if (this.height(value, width, size, font) <= height)
      return [value, ""] as const;
    const chars = Array.from(value);
    let low = 0,
      high = chars.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (
        this.height(chars.slice(0, mid).join(""), width, size, font) <= height
      )
        low = mid;
      else high = mid - 1;
    }
    if (!low)
      throw new ExportRenderError("Unable to fit text on a report page");
    // Keep ordinary words together without dropping any original characters.
    const candidate = chars.slice(0, low).join("");
    const boundary = Math.max(
      candidate.lastIndexOf(" "),
      candidate.lastIndexOf("\n"),
    );
    if (boundary > candidate.length * 0.7)
      low = Array.from(candidate.slice(0, boundary + 1)).length;
    return [chars.slice(0, low).join(""), chars.slice(low).join("")] as const;
  }
  block(value: string, color: string = C.secondary, size = 10) {
    let remaining = value;
    while (remaining) {
      this.space(25);
      const [chunk, rest] = this.fit(remaining, W, BOTTOM - this.y - 4, size);
      const height = this.height(chunk, W, size);
      this.doc
        .font("Regular")
        .fontSize(size)
        .fillColor(color)
        .text(chunk, L, this.y, { width: W, lineGap: 3 });
      this.y += height + 8;
      remaining = rest;
      if (remaining) this.page(this.section);
    }
  }
  empty(message: string = this.t.empty) {
    const height = this.height(message, W - 28, 10) + 28;
    this.space(height + 10);
    this.doc.roundedRect(L, this.y, W, height, 6).fill(C.table);
    this.doc
      .font("Regular")
      .fontSize(10)
      .fillColor(C.muted)
      .text(message, L + 14, this.y + 13, { width: W - 28, lineGap: 3 });
    this.y += height + 14;
  }
  date(value: unknown) {
    if (!value) return this.t.missing;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? this.t.missing
      : new Intl.DateTimeFormat(this.locale === "vi" ? "vi-VN" : "en-GB", {
          timeZone: "UTC",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  }
  label(key: string) {
    return LABELS[key]?.[this.column] ?? key;
  }
  value(key: string, value: unknown): string {
    if (value === null || value === undefined || value === "")
      return this.t.missing;
    if (typeof value === "boolean") return value ? this.t.yes : this.t.no;
    if (/(At|Date)$/.test(key)) return this.date(value);
    if (Array.isArray(value))
      return value.map((item) => String(item)).join(", ");
    return String(value);
  }
  status(value: string) {
    return STATUSES[value]?.[this.column] ?? value;
  }
  info(fields: Record<string, unknown>, omit: string[] = []) {
    const rows = Object.entries(fields)
      .filter(([key]) => !omit.includes(key))
      .map(([key, value]) => [this.label(key), this.value(key, value)]);
    if (rows.length)
      this.table([this.t.property, this.t.value], rows, [0.32, 0.68]);
    else this.empty();
  }
  table(headers: string[], rows: string[][], ratios: number[]) {
    const widths = ratios.map((ratio) => ratio * W);
    const header = () => {
      this.space(62);
      this.doc.rect(L, this.y, W, 29).fill(C.ink);
      let x = L;
      headers.forEach((text, i) => {
        this.doc
          .font("Bold")
          .fontSize(9)
          .fillColor("#FFFFFF")
          .text(text, x + 9, this.y + 8, {
            width: widths[i]! - 18,
            lineGap: 1,
          });
        x += widths[i]!;
      });
      this.y += 29;
    };
    header();
    rows.forEach((row, rowIndex) => {
      let remaining = row.map((cell) => cell || " ");
      do {
        this.guard();
        if (BOTTOM - this.y < 42) {
          this.page(this.section);
          header();
        }
        const available = BOTTOM - this.y - 18;
        const pieces = remaining.map((cell, i) =>
          this.fit(cell, widths[i]! - 18, available, 9.5),
        );
        const rowHeight =
          Math.max(
            16,
            ...pieces.map(([chunk], i) =>
              this.height(chunk, widths[i]! - 18, 9.5),
            ),
          ) + 18;
        this.doc
          .rect(L, this.y, W, rowHeight)
          .fillAndStroke(rowIndex % 2 ? "#FFFFFF" : C.table, C.line);
        let x = L;
        pieces.forEach(([chunk], i) => {
          this.doc
            .font("Regular")
            .fontSize(9.5)
            .fillColor(C.ink)
            .text(chunk, x + 9, this.y + 8, {
              width: widths[i]! - 18,
              lineGap: 3,
            });
          x += widths[i]!;
        });
        this.y += rowHeight;
        remaining = pieces.map(([, rest]) => rest);
        if (remaining.some(Boolean)) {
          this.page(this.section);
          header();
        }
      } while (remaining.some(Boolean));
    });
    this.y += 16;
  }
  finish() {
    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      this.doc.switchToPage(i);
      const bottom = this.doc.page.margins.bottom;
      this.doc.page.margins.bottom = 0;
      this.doc
        .moveTo(L, 799)
        .lineTo(L + W, 799)
        .strokeColor(C.line)
        .lineWidth(0.5)
        .stroke();
      this.doc
        .font("Regular")
        .fontSize(8)
        .fillColor(C.muted)
        .text(
          `${this.t.confidentiality}  |  ${this.ref.slice(0, 13)}`,
          L,
          809,
          { width: W - 95, lineBreak: false },
        );
      this.doc.text(
        `${this.t.page} ${i + 1} / ${range.count}`,
        L + W - 95,
        809,
        { width: 95, align: "right", lineBreak: false },
      );
      this.doc.page.margins.bottom = bottom;
    }
    this.doc.end();
  }
}

export class PersonalDataPdfRenderer {
  static async render(
    payload: PersonalDataExportPayload,
    locale: ExportLocale = "vi",
  ): Promise<Buffer> {
    const account = personalDataAccountSchema.parse(
      sanitizePersonalData(JSON.parse(JSON.stringify(payload.account))),
    );
    const reference = payload.metadata?.referenceId ?? randomUUID();
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        autoFirstPage: false,
        size: "A4",
        margins: { top: TOP, bottom: 65, left: L, right: L },
        bufferPages: true,
        info: {
          Title: "RemoteSEA Personal Data Report",
          Author: "RemoteSEA",
          Subject: "Personal account archive",
          CreationDate: new Date(payload.exportedAt),
        },
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      doc.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024)
          doc.destroy(
            new ExportTooLargeError("PDF exceeds download size limit"),
          );
        else chunks.push(chunk);
      });
      doc.on("error", reject);
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      try {
        doc.registerFont(
          "Regular",
          path.resolve(
            __dirname,
            "../../assets/fonts/LiberationSans-Regular.ttf",
          ),
        );
        doc.registerFont(
          "Bold",
          path.resolve(__dirname, "../../assets/fonts/LiberationSans-Bold.ttf"),
        );
        const r = new Report(doc, locale, reference),
          t = r.t;
        const applications = account.talent?.applications ?? [],
          messages = account.messages ?? [];
        r.page(t.cover, true);
        doc.rect(0, 0, 595.28, 12).fill(C.accent);
        doc
          .font("Bold")
          .fontSize(20)
          .fillColor(C.accent)
          .text("REMOTESEA", L, 55);
        doc
          .font("Regular")
          .fontSize(9)
          .fillColor(C.muted)
          .text(t.personal, L, 85);
        doc.roundedRect(L, 175, 110, 24, 5).fill(C.pale);
        doc
          .font("Bold")
          .fontSize(9)
          .fillColor(C.accent)
          .text("DATA EXPORT", L + 12, 183, { lineBreak: false });
        doc
          .font("Bold")
          .fontSize(26)
          .fillColor(C.ink)
          .text("BÁO CÁO DỮ LIỆU\nCÁ NHÂN", L, 222, { width: W, lineGap: 5 });
        doc
          .font("Regular")
          .fontSize(13)
          .fillColor(C.secondary)
          .text("PERSONAL DATA EXPORT REPORT", L, 300, { width: W });
        r.y = 360;
        r.table(
          [t.property, t.value],
          [
            [r.label("name"), account.name || t.missing],
            [r.label("email"), account.email],
            [t.generated, r.date(payload.exportedAt)],
            [t.reference, reference],
            [t.version, payload.metadata?.schemaVersion ?? "2.0"],
          ],
          [0.34, 0.66],
        );
        r.y = Math.max(r.y + 10, 652);
        r.block(t.notice, C.muted, 9);

        r.page(t.overview);
        r.heading(t.overview);
        const stats = [
          [t.profiles, Number(!!account.talent) + Number(!!account.employer)],
          [t.apps, applications.length],
          [t.msgs, messages.length],
          [
            t.prefs,
            Object.values(account.notificationPreference ?? {}).filter(
              (value) => typeof value === "boolean",
            ).length,
          ],
        ];
        const cardTop = r.y;
        stats.forEach(([label, count], i) => {
          const x = L + ((i % 2) * (W + 16)) / 2,
            y = cardTop + Math.floor(i / 2) * 99,
            width = (W - 16) / 2;
          doc.roundedRect(x, y, width, 83, 7).fillAndStroke(C.table, C.line);
          doc
            .font("Regular")
            .fontSize(10)
            .fillColor(C.secondary)
            .text(String(label), x + 15, y + 13, { width: width - 30 });
          doc
            .font("Bold")
            .fontSize(26)
            .fillColor(C.accent)
            .text(String(count), x + 15, y + 36);
        });
        r.y = cardTop + 214;
        r.info({
          [t.generated]: r.date(payload.exportedAt),
          [t.timezone]: "UTC",
          [t.scope]: t.scopeSummary,
        });
        r.block(t.consistency);
        r.block(t.messageScope);
        r.block(
          locale === "vi"
            ? "Các mục chưa có dữ liệu được đánh dấu rõ trong từng phần của báo cáo."
            : "Sections without stored data are identified within the report.",
          C.muted,
          9,
        );

        r.page(t.account);
        r.heading(t.account);
        r.info({
          name: account.name,
          email: account.email,
          phone: account.phone,
          role: account.role,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          [t.accountStatus]: account.bannedAt
            ? t.banned
            : account.isPaused
              ? t.paused
              : t.active,
          language: account.language,
          region: account.region,
          currencyDisplay: account.currencyDisplay,
          emailVerified: account.emailVerified,
          image: account.image,
          ...(account.pausedAt && { pausedAt: account.pausedAt }),
          ...(account.bannedAt && { bannedAt: account.bannedAt }),
        });

        r.page(t.profile);
        r.heading(t.profile);
        if (account.talent) {
          const {
            skills,
            workExperiences,
            profileHighlights,
            applications: _applications,
            id: _id,
            ...profile
          } = account.talent;
          void _applications;
          void _id;
          r.info(profile);
          r.sub(t.skills);
          if (skills?.length)
            r.block(
              skills
                .map(
                  (skill) =>
                    skill.skill.name +
                    (skill.yearsExp === null || skill.yearsExp === undefined
                      ? ""
                      : ` (${skill.yearsExp})`),
                )
                .join("  /  "),
            );
          else r.empty();
          r.sub(t.experience);
          if (workExperiences?.length)
            workExperiences.forEach((experience) => r.info(experience));
          else r.empty();
          r.sub(t.highlights);
          if (profileHighlights?.length)
            profileHighlights.forEach((highlight) => r.info(highlight));
          else r.empty();
          r.block(t.noCert, C.muted, 9);
        } else r.empty();
        if (account.employer) {
          r.sub(t.company);
          const { jobs, ...company } = account.employer;
          r.info(company);
          r.sub(t.jobs);
          if (jobs?.length)
            r.table(
              [t.position, t.status, t.generated],
              jobs.map((job) => [
                job.title,
                r.status(job.status),
                r.date(job.createdAt),
              ]),
              [0.5, 0.22, 0.28],
            );
          else r.empty();
        }

        r.page(t.applications);
        r.heading(t.applications);
        if (!applications.length) r.empty();
        else {
          r.table(
            [t.position, t.status, t.applied, t.updated],
            applications.map((application) => [
              `${application.job.title}\n${application.job.employer.companyName}`,
              r.status(application.status),
              r.date(application.appliedAt),
              r.date(application.updatedAt),
            ]),
            [0.4, 0.2, 0.2, 0.2],
          );
          applications.forEach((application, i) => {
            const {
              id: _id,
              job,
              status,
              appliedAt: _appliedAt,
              updatedAt: _updatedAt,
              statusEvents,
              ...details
            } = application;
            void _id;
            void status;
            void _appliedAt;
            void _updatedAt;
            const present = Object.fromEntries(
              Object.entries(details).filter(
                ([, value]) =>
                  value !== null && value !== undefined && value !== "",
              ),
            );
            if (Object.keys(present).length || statusEvents?.length) {
              r.sub(`${i + 1}. ${job.title}`);
              if (Object.keys(present).length) r.info(present);
              if (statusEvents?.length)
                r.table(
                  [t.status, t.generated],
                  statusEvents.map((event) => [
                    r.status(event.status),
                    r.date(event.createdAt),
                  ]),
                  [0.5, 0.5],
                );
            }
          });
        }

        r.page(t.messages);
        r.heading(t.messages);
        r.block(t.messageScope, C.muted, 9);
        const groups = new Map<string, typeof messages>();
        for (const message of messages) {
          const group = groups.get(message.applicationId) ?? [];
          group.push(message);
          groups.set(message.applicationId, group);
        }
        if (!groups.size) r.empty();
        let groupIndex = 0;
        for (const group of groups.values()) {
          r.sub(`${t.conversation} ${String(++groupIndex).padStart(2, "0")}`);
          const job = group[0]!.application?.job;
          if (job)
            r.block(
              `${job.title} / ${job.employer.companyName}`,
              C.secondary,
              10,
            );
          for (const message of [...group].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )) {
            r.space(64);
            r.block(
              `${t.you}: ${account.name || account.email}  |  ${t.sent}: ${r.date(message.createdAt)}`,
              C.accent,
              9,
            );
            r.block(message.body);
            r.space(12);
            doc
              .moveTo(L, r.y)
              .lineTo(L + W, r.y)
              .strokeColor(C.line)
              .lineWidth(0.5)
              .stroke();
            r.y += 14;
          }
        }

        r.page(t.notifications);
        r.heading(t.notifications);
        if (account.notificationPreference) {
          const { updatedAt, ...preferences } = account.notificationPreference;
          r.info(preferences);
          if (updatedAt)
            r.block(`${t.updated}: ${r.date(updatedAt)}`, C.muted, 9);
        } else r.empty(t.noPrefs);
        r.sub(t.alerts);
        if (account.jobAlerts?.length)
          account.jobAlerts.forEach((alert) => {
            const { categories, ...fields } = alert;
            r.info({
              ...fields,
              categories: categories?.map((item) => item.category.name) ?? [],
            });
          });
        else r.empty();

        r.page(t.about);
        r.heading(t.about);
        r.info({
          [t.generated]: r.date(payload.exportedAt),
          [t.timezone]: "UTC",
          [t.reference]: reference,
          [t.version]: payload.metadata?.schemaVersion ?? "2.0",
        });
        r.block(t.scopeSummary);
        r.block(t.messageScope);
        r.block(t.consistency);
        r.block(t.exclusions);
        r.block(t.bounds);
        r.sub(t.confidentiality);
        r.block(t.policy);
        r.finish();
      } catch (error) {
        doc.destroy();
        reject(error);
      }
    });
  }
}
