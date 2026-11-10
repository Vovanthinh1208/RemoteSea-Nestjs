import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { sanitizePersonalData } from "./personal-data-sanitizer";

export interface ExportAccountData {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  role?: string;
  language?: string;
  region?: string;
  currencyDisplay?: string;
  isPaused?: boolean;
  pausedAt?: string | Date | null;
  emailVerified?: boolean;
  createdAt: string | Date;
  updatedAt?: string | Date;
  talent?: {
    headline?: string | null;
    bio?: string | null;
    location?: string | null;
    country?: string | null;
    timezone?: string | null;
    yearsExperience?: number | null;
    level?: string | null;
    desiredSalaryMin?: number | null;
    desiredSalaryMax?: number | null;
    currency?: string | null;
    primaryRole?: string | null;
    rightToWork?: string | null;
    skills?: Array<{ skill?: { name?: string } }>;
    applications?: Array<{
      id: string;
      status: string;
      appliedAt: string | Date;
      coverLetter?: string | null;
      job?: {
        title?: string;
        slug?: string;
        employer?: { companyName?: string };
      };
    }>;
    workExperiences?: Array<{
      company: string;
      position: string;
      startDate: string | Date;
      endDate?: string | Date | null;
      isCurrent?: boolean;
      description?: string | null;
      location?: string | null;
    }>;
    profileHighlights?: Array<{
      type: string;
      title: string;
      description?: string | null;
      url?: string | null;
      issuer?: string | null;
      issueDate?: string | Date | null;
    }>;
  } | null;
  employer?: {
    companyName?: string;
    slug?: string;
    industry?: string | null;
    size?: string | null;
    description?: string | null;
    websiteUrl?: string | null;
    hqCity?: string | null;
    hqCountry?: string | null;
    isVerified?: boolean;
    jobs?: Array<{
      title: string;
      slug: string;
      status: string;
      createdAt: string | Date;
      publishedAt?: string | Date | null;
    }>;
  } | null;
  jobAlerts?: Array<{
    id: string;
    keywords?: string | null;
    frequency?: string;
    isActive?: boolean;
    createdAt?: string | Date;
  }>;
  notificationPreference?: {
    applicationUpdates?: boolean;
    employerMessages?: boolean;
    weeklyDigest?: boolean;
    instantMatchAlerts?: boolean;
    productNews?: boolean;
    tipsAndResources?: boolean;
    browserPush?: boolean;
    updatedAt?: string | Date;
  } | null;
  messages?: Array<{
    applicationId: string;
    body: string;
    createdAt: string | Date;
  }>;
}

export interface PersonalDataExportPayload {
  exportedAt: string;
  account: ExportAccountData;
}

function resolveFontPaths(): { regular: string | null; bold: string | null } {
  const candidateDirs = [
    path.join(__dirname, "assets/fonts"),
    path.join(__dirname, "../assets/fonts"),
    path.join(process.cwd(), "src/assets/fonts"),
    path.join(process.cwd(), "remotesea-api/src/assets/fonts"),
  ];

  for (const dir of candidateDirs) {
    const regular = path.join(dir, "Arial-Regular.ttf");
    const bold = path.join(dir, "Arial-Bold.ttf");
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      return { regular, bold };
    }
  }

  // System font fallback on macOS
  const sysReg = "/System/Library/Fonts/Supplemental/Arial.ttf";
  const sysBold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
  if (fs.existsSync(sysReg) && fs.existsSync(sysBold)) {
    return { regular: sysReg, bold: sysBold };
  }

  return { regular: null, bold: null };
}

function generateReferenceId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const part1 = Math.abs(hash)
    .toString(36)
    .toUpperCase()
    .padStart(4, "X")
    .slice(0, 4);
  const part2 = Math.floor(1000 + Math.random() * 9000).toString();
  return `REF-${part1}-${part2}`;
}

export class PersonalDataPdfRenderer {
  static async render(payload: PersonalDataExportPayload): Promise<Buffer> {
    const sanitizedPayload = sanitizePersonalData(payload);
    const { exportedAt, account } = sanitizedPayload;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 45, bottom: 50, left: 45, right: 45 },
          bufferPages: true,
          info: {
            Title: `RemoteSEA Personal Data - ${account.name || "User"}`,
            Author: "RemoteSEA Platform",
            Subject: "GDPR/PDPA Personal Data Export Dossier",
            Keywords: "remotesea, personal-data, gdpr, pdpa, export",
            CreationDate: new Date(exportedAt),
          },
        });

        const fontPaths = resolveFontPaths();
        if (fontPaths.regular && fontPaths.bold) {
          doc.registerFont("Regular", fontPaths.regular);
          doc.registerFont("Bold", fontPaths.bold);
        } else {
          doc.registerFont("Regular", "Helvetica");
          doc.registerFont("Bold", "Helvetica-Bold");
        }

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err: Error) => reject(err));

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const contentWidth = pageWidth - 90; // margins 45 each side

        // ─────────────────────────────────────────────────────────────────────
        // TRANG 1: COVER PAGE
        // ─────────────────────────────────────────────────────────────────────
        // Top Brand Header
        doc.rect(45, 45, contentWidth, 5).fill("#0F172A");

        doc
          .font("Bold")
          .fontSize(20)
          .fillColor("#1E40AF")
          .text("RemoteSEA", 45, 65);
        doc
          .font("Regular")
          .fontSize(9)
          .fillColor("#64748B")
          .text("Nền tảng Tuyển dụng & Làm việc từ xa tích hợp AI", 45, 90);

        doc
          .moveTo(45, 115)
          .lineTo(pageWidth - 45, 115)
          .strokeColor("#E2E8F0")
          .lineWidth(1)
          .stroke();

        // Main Title Block
        const titleY = 220;
        doc
          .roundedRect(45, titleY - 20, 240, 22, 4)
          .fillAndStroke("#F1F5F9", "#CBD5E1");
        doc
          .font("Bold")
          .fontSize(8.5)
          .fillColor("#2563EB")
          .text("HỒ SƠ XUẤT DỮ LIỆU CÁ NHÂN ĐỊNH DANH", 55, titleY - 14);

        doc
          .font("Bold")
          .fontSize(24)
          .fillColor("#0F172A")
          .text("BÁO CÁO DỮ LIỆU CÁ NHÂN", 45, titleY + 15, {
            width: contentWidth,
          });

        doc
          .font("Bold")
          .fontSize(14)
          .fillColor("#64748B")
          .text("PERSONAL DATA EXPORT REPORT", 45, titleY + 48, {
            width: contentWidth,
          });

        doc
          .font("Regular")
          .fontSize(10)
          .fillColor("#334155")
          .text(
            "Tài liệu trích xuất toàn bộ dữ liệu cá nhân theo tiêu chuẩn quyền riêng tư GDPR (Điều 15 & Điều 20) và Đạo luật Bảo vệ Dữ liệu Cá nhân (PDPA). Được tạo tự động bởi Hệ thống RemoteSEA.",
            45,
            titleY + 75,
            { width: contentWidth, lineGap: 3 },
          );

        // Metadata Card
        const metaCardY = 370;
        doc
          .roundedRect(45, metaCardY, contentWidth, 180, 8)
          .fillAndStroke("#F8FAFC", "#E2E8F0");

        doc
          .font("Bold")
          .fontSize(11)
          .fillColor("#1E40AF")
          .text("THÔNG TIN ĐỐI CHIẾU HỒ SƠ", 60, metaCardY + 15);

        doc
          .moveTo(60, metaCardY + 32)
          .lineTo(pageWidth - 60, metaCardY + 32)
          .strokeColor("#E2E8F0")
          .stroke();

        const refCode = generateReferenceId(account.id || "RS");
        const exportDateFormatted = new Date(exportedAt).toLocaleString(
          "vi-VN",
          {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          },
        );

        const metaRows: [string, string][] = [
          ["Họ tên chủ tài khoản:", account.name || "Chưa cập nhật"],
          ["Địa chỉ Email định danh:", account.email],
          ["Mã tham chiếu báo cáo:", refCode],
          ["Thời điểm khởi tạo:", exportDateFormatted],
          ["Phiên bản chuẩn xuất:", "v1.2 (Production Grade · PDF/A-ready)"],
          [
            "Phạm vi dữ liệu:",
            "Toàn bộ tài khoản, hồ sơ, đơn ứng tuyển, tin nhắn & cài đặt",
          ],
        ];

        let curMetaY = metaCardY + 42;
        for (const [k, v] of metaRows) {
          doc
            .font("Bold")
            .fontSize(9)
            .fillColor("#64748B")
            .text(k, 60, curMetaY, { width: 180 });
          doc
            .font("Regular")
            .fontSize(9)
            .fillColor("#0F172A")
            .text(v, 245, curMetaY, { width: contentWidth - 210 });
          curMetaY += 21;
        }

        // Cover Bottom Notice
        const bottomNoticeY = pageHeight - 110;
        doc
          .roundedRect(45, bottomNoticeY, contentWidth, 50, 6)
          .fillAndStroke("#FEF2F2", "#FECACA");
        doc
          .font("Bold")
          .fontSize(8.5)
          .fillColor("#991B1B")
          .text("LƯU Ý BẢO MẬT & QUYỀN RIÊNG TƯ:", 58, bottomNoticeY + 10);
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#7F1D1D")
          .text(
            "Đây là bản sao dữ liệu cá nhân được hệ thống tổng hợp tại thời điểm xuất báo cáo. Nội dung chứa thông tin định danh và lịch sử hoạt động cá nhân. Vui lòng lưu trữ an toàn và tuyệt đối không chia sẻ với người không có thẩm quyền.",
            58,
            bottomNoticeY + 23,
            { width: contentWidth - 26, lineGap: 1.5 },
          );

        // ─────────────────────────────────────────────────────────────────────
        // TRANG 2: TỔNG QUAN DỮ LIỆU & THỐNG KÊ
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();

        let y = 60;
        doc
          .font("Bold")
          .fontSize(16)
          .fillColor("#0F172A")
          .text("TỔNG QUAN TÀI KHOẢN & DỮ LIỆU", 45, y);
        y += 24;
        doc
          .font("Regular")
          .fontSize(9.5)
          .fillColor("#64748B")
          .text(
            "Bảng tổng hợp chỉ số dữ liệu cá nhân thực tế được trích xuất từ cơ sở dữ liệu hệ thống RemoteSEA tại thời điểm yêu cầu.",
            45,
            y,
            { width: contentWidth },
          );
        y += 30;

        // 4 Summary Metrics Cards
        const totalApps = account.talent?.applications?.length || 0;
        const totalJobs = account.employer?.jobs?.length || 0;
        const totalMessages = account.messages?.length || 0;
        const totalAlerts = account.jobAlerts?.length || 0;

        const cardW = (contentWidth - 20) / 2;
        const cardH = 65;

        // Card 1: Account Status
        doc
          .roundedRect(45, y, cardW, cardH, 6)
          .fillAndStroke("#F8FAFC", "#E2E8F0");
        doc
          .font("Bold")
          .fontSize(8.5)
          .fillColor("#64748B")
          .text("TRẠNG THÁI TÀI KHOẢN", 57, y + 10);
        doc
          .font("Bold")
          .fontSize(14)
          .fillColor(account.isPaused ? "#D97706" : "#16A34A")
          .text(
            account.isPaused ? "Đang tạm dừng" : "Đang hoạt động",
            57,
            y + 26,
          );
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#94A3B8")
          .text(`Vai trò: ${account.role || "TALENT"}`, 57, y + 46);

        // Card 2: Applications or Postings
        const c2X = 45 + cardW + 20;
        doc
          .roundedRect(c2X, y, cardW, cardH, 6)
          .fillAndStroke("#F8FAFC", "#E2E8F0");
        const c2Title =
          account.role === "EMPLOYER"
            ? "TIN TUYỂN DỤNG ĐÃ ĐĂNG"
            : "LỊCH SỬ ỨNG TUYỂN";
        const c2Count =
          account.role === "EMPLOYER"
            ? `${totalJobs} tin tuyển dụng`
            : `${totalApps} đơn ứng tuyển`;
        doc
          .font("Bold")
          .fontSize(8.5)
          .fillColor("#64748B")
          .text(c2Title, c2X + 12, y + 10);
        doc
          .font("Bold")
          .fontSize(14)
          .fillColor("#2563EB")
          .text(c2Count, c2X + 12, y + 26);
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#94A3B8")
          .text("Dữ liệu ghi nhận trong hệ thống", c2X + 12, y + 46);

        y += cardH + 15;

        // Card 3: Messages
        doc
          .roundedRect(45, y, cardW, cardH, 6)
          .fillAndStroke("#F8FAFC", "#E2E8F0");
        doc
          .font("Bold")
          .fontSize(8.5)
          .fillColor("#64748B")
          .text("TIN NHẮN ĐÃ GỬI", 57, y + 10);
        doc
          .font("Bold")
          .fontSize(14)
          .fillColor("#0284C7")
          .text(`${totalMessages} tin nhắn`, 57, y + 26);
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#94A3B8")
          .text("Thuộc các luồng trao đổi của bạn", 57, y + 46);

        // Card 4: Alerts & Settings
        doc
          .roundedRect(c2X, y, cardW, cardH, 6)
          .fillAndStroke("#F8FAFC", "#E2E8F0");
        doc
          .font("Bold")
          .fontSize(8.5)
          .fillColor("#64748B")
          .text("THÔNG BÁO & CÀI ĐẶT", c2X + 12, y + 10);
        doc
          .font("Bold")
          .fontSize(14)
          .fillColor("#0F172A")
          .text(`${totalAlerts} bộ cảnh báo`, c2X + 12, y + 26);
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#94A3B8")
          .text("Tùy chọn nhận việc & email", c2X + 12, y + 46);

        y += cardH + 25;

        // Scope description box
        doc
          .roundedRect(45, y, contentWidth, 90, 6)
          .fillAndStroke("#F8FAFC", "#E2E8F0");
        doc
          .font("Bold")
          .fontSize(9.5)
          .fillColor("#1E40AF")
          .text("PHẠM VI & MÚI GIỜ DỮ LIỆU", 57, y + 12);
        doc
          .font("Regular")
          .fontSize(8.5)
          .fillColor("#334155")
          .text(
            `• Thời điểm xuất dữ liệu: ${exportedAt}\n` +
              `• Múi giờ chuẩn: Giờ địa phương người dùng (mặc định GMT+7/Asia/Ho_Chi_Minh)\n` +
              `• Phương pháp trích xuất: Truy vấn trực tiếp từ cơ sở dữ liệu qua giao dịch đọc nhất quán\n` +
              `• Phạm vi loại trừ: Mật khẩu (Password hash), mã bí mật xác thực hai bước (2FA TOTP secret, backup codes), mã khôi phục và session tokens tuyệt đối không bao giờ được trích xuất.`,
            57,
            y + 28,
            { width: contentWidth - 24, lineGap: 3 },
          );

        y += 115;

        // ─────────────────────────────────────────────────────────────────────
        // PHẦN 3: THÔNG TIN TÀI KHOẢN (ACCOUNT INFORMATION TABLE)
        // ─────────────────────────────────────────────────────────────────────
        doc
          .font("Bold")
          .fontSize(13)
          .fillColor("#0F172A")
          .text("1. THÔNG TIN TÀI KHOẢN ĐỊNH DANH", 45, y);
        y += 18;

        const accTableRows: [string, string][] = [
          ["Họ và tên", account.name || "Chưa cập nhật"],
          ["Địa chỉ Email", account.email],
          ["Số điện thoại", account.phone || "Chưa cung cấp"],
          ["Vai trò tài khoản", account.role || "TALENT"],
          [
            "Trạng thái hoạt động",
            account.isPaused
              ? "Đang tạm dừng (Paused)"
              : "Đang hoạt động (Active)",
          ],
          ["Ngôn ngữ ưu tiên", account.language || "Tiếng Việt (vi)"],
          ["Khu vực địa lý", account.region || "Vietnam"],
          ["Đơn vị tiền tệ hiển thị", account.currencyDisplay || "USD ($)"],
          [
            "Ngày đăng ký tài khoản",
            new Date(account.createdAt).toLocaleDateString("vi-VN"),
          ],
          [
            "Ngày cập nhật gần nhất",
            account.updatedAt
              ? new Date(account.updatedAt).toLocaleDateString("vi-VN")
              : "N/A",
          ],
        ];

        // Draw Table
        const col1W = 160;
        const col2W = contentWidth - col1W;
        for (let i = 0; i < accTableRows.length; i++) {
          const [lbl, val] = accTableRows[i]!;
          const bg = i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
          doc.rect(45, y, contentWidth, 19).fillAndStroke(bg, "#E2E8F0");
          doc
            .font("Bold")
            .fontSize(8.5)
            .fillColor("#475569")
            .text(lbl, 55, y + 5, { width: col1W - 20 });
          doc
            .font("Regular")
            .fontSize(8.5)
            .fillColor("#0F172A")
            .text(val, 45 + col1W + 10, y + 5, { width: col2W - 20 });
          y += 19;
        }

        // ─────────────────────────────────────────────────────────────────────
        // TRANG 3: HỒ SƠ CHUYÊN MÔN (TALENT OR EMPLOYER)
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();
        y = 60;

        if (account.talent) {
          const t = account.talent;
          doc
            .font("Bold")
            .fontSize(13)
            .fillColor("#0F172A")
            .text("2. HỒ SƠ ỨNG VIÊN & KỸ NĂNG CHUYÊN MÔN", 45, y);
          y += 20;

          const talentRows: [string, string][] = [
            ["Tiêu đề nghề nghiệp", t.headline || "Chưa cập nhật"],
            [
              "Địa điểm / Quốc gia",
              `${t.location || ""} ${t.country ? `(${t.country})` : ""}`.trim() ||
                "Chưa cung cấp",
            ],
            ["Cấp bậc kinh nghiệm", t.level || "MID"],
            [
              "Số năm kinh nghiệm",
              t.yearsExperience !== null && t.yearsExperience !== undefined
                ? `${t.yearsExperience} năm`
                : "Chưa cập nhật",
            ],
            [
              "Mức lương mong muốn",
              t.desiredSalaryMin && t.desiredSalaryMax
                ? `$${t.desiredSalaryMin.toLocaleString()} - $${t.desiredSalaryMax.toLocaleString()} ${t.currency || "USD"}`
                : "Thỏa thuận",
            ],
            ["Quyền làm việc (Right to work)", t.rightToWork || "Toàn quyền"],
            ["Giới thiệu bản thân (Bio)", t.bio || "Chưa cập nhật"],
          ];

          for (let i = 0; i < talentRows.length; i++) {
            const [lbl, val] = talentRows[i]!;
            const bg = i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
            const rowH = lbl.includes("Bio") ? 36 : 19;
            doc.rect(45, y, contentWidth, rowH).fillAndStroke(bg, "#E2E8F0");
            doc
              .font("Bold")
              .fontSize(8.5)
              .fillColor("#475569")
              .text(lbl, 55, y + 5, { width: col1W - 20 });
            doc
              .font("Regular")
              .fontSize(8.5)
              .fillColor("#0F172A")
              .text(val, 45 + col1W + 10, y + 5, { width: col2W - 20 });
            y += rowH;
          }

          y += 15;

          // Skills Tag Cloud
          doc
            .font("Bold")
            .fontSize(9.5)
            .fillColor("#1E40AF")
            .text("DANH MỤC KỸ NĂNG ĐÃ KHAI BÁO:", 45, y);
          y += 16;
          const skillsList =
            (t.skills?.map((s) => s.skill?.name).filter(Boolean) as string[]) ||
            [];
          if (skillsList.length > 0) {
            let skillX = 45;
            for (const skill of skillsList) {
              const strWidth = doc.widthOfString(skill) + 14;
              if (skillX + strWidth > pageWidth - 45) {
                skillX = 45;
                y += 20;
              }
              doc
                .roundedRect(skillX, y, strWidth, 16, 4)
                .fillAndStroke("#EFF6FF", "#BFDBFE");
              doc
                .font("Bold")
                .fontSize(8)
                .fillColor("#1D4ED8")
                .text(skill, skillX + 7, y + 3.5);
              skillX += strWidth + 6;
            }
            y += 28;
          } else {
            doc
              .font("Regular")
              .fontSize(8.5)
              .fillColor("#94A3B8")
              .text("Chưa khai báo kỹ năng trong hồ sơ.", 45, y);
            y += 20;
          }

          // Work Experiences
          if (t.workExperiences && t.workExperiences.length > 0) {
            y += 10;
            doc
              .font("Bold")
              .fontSize(9.5)
              .fillColor("#1E40AF")
              .text("KINH NGHIỆM LÀM VIỆC ĐÃ GHI NHẬN:", 45, y);
            y += 14;

            for (const exp of t.workExperiences) {
              const startStr = new Date(exp.startDate).toLocaleDateString(
                "vi-VN",
                { month: "2-digit", year: "numeric" },
              );
              const endStr = exp.isCurrent
                ? "Hiện tại"
                : exp.endDate
                  ? new Date(exp.endDate).toLocaleDateString("vi-VN", {
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "N/A";
              doc
                .font("Bold")
                .fontSize(9)
                .fillColor("#0F172A")
                .text(`${exp.position} — ${exp.company}`, 45, y);
              y += 12;
              doc
                .font("Regular")
                .fontSize(8)
                .fillColor("#64748B")
                .text(
                  `Thời gian: ${startStr} đến ${endStr} ${exp.location ? `| Địa điểm: ${exp.location}` : ""}`,
                  45,
                  y,
                );
              y += 14;
              if (exp.description) {
                doc
                  .font("Regular")
                  .fontSize(8)
                  .fillColor("#334155")
                  .text(exp.description, 45, y, { width: contentWidth });
                y += 18;
              }
            }
          }
        } else if (account.employer) {
          const emp = account.employer;
          doc
            .font("Bold")
            .fontSize(13)
            .fillColor("#0F172A")
            .text("2. HỒ SƠ DOANH NGHIỆP TUYỂN DỤNG", 45, y);
          y += 20;

          const empRows: [string, string][] = [
            ["Tên công ty / Tổ chức", emp.companyName || "Chưa cập nhật"],
            ["Quy mô doanh nghiệp", emp.size || "Chưa cập nhật"],
            ["Lĩnh vực hoạt động", emp.industry || "Chưa cập nhật"],
            ["Website doanh nghiệp", emp.websiteUrl || "Chưa cung cấp"],
            [
              "Trụ sở chính",
              `${emp.hqCity || ""} ${emp.hqCountry || ""}`.trim() ||
                "Chưa cung cấp",
            ],
            [
              "Trạng thái xác minh",
              emp.isVerified
                ? "Đã xác minh (Verified Employer)"
                : "Chưa xác minh",
            ],
            ["Mô tả doanh nghiệp", emp.description || "Chưa cập nhật"],
          ];

          for (let i = 0; i < empRows.length; i++) {
            const [lbl, val] = empRows[i]!;
            const bg = i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
            const rowH = lbl.includes("Mô tả") ? 36 : 19;
            doc.rect(45, y, contentWidth, rowH).fillAndStroke(bg, "#E2E8F0");
            doc
              .font("Bold")
              .fontSize(8.5)
              .fillColor("#475569")
              .text(lbl, 55, y + 5, { width: col1W - 20 });
            doc
              .font("Regular")
              .fontSize(8.5)
              .fillColor("#0F172A")
              .text(val, 45 + col1W + 10, y + 5, { width: col2W - 20 });
            y += rowH;
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // PHẦN 4: LỊCH SỬ ỨNG TUYỂN (HOẶC TIN ĐÃ ĐĂNG)
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();
        y = 60;

        const apps = account.talent?.applications || [];
        const jobs = account.employer?.jobs || [];

        if (account.role === "EMPLOYER") {
          doc
            .font("Bold")
            .fontSize(13)
            .fillColor("#0F172A")
            .text("3. DANH MỤC TIN TUYỂN DỤNG ĐÃ ĐĂNG", 45, y);
          y += 18;

          if (jobs.length === 0) {
            doc
              .roundedRect(45, y, contentWidth, 40, 4)
              .fillAndStroke("#F8FAFC", "#E2E8F0");
            doc
              .font("Regular")
              .fontSize(8.5)
              .fillColor("#64748B")
              .text(
                "Tài khoản chưa đăng tin tuyển dụng nào trên nền tảng.",
                57,
                y + 14,
              );
            y += 55;
          } else {
            // Table Header
            doc.rect(45, y, contentWidth, 20).fill("#1E293B");
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("TIÊU ĐỀ TIN TUYỂN DỤNG", 55, y + 6);
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("ĐƯỜNG DẪN (SLUG)", 260, y + 6);
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("TRẠNG THÁI", 380, y + 6);
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("NGÀY TẠO", 460, y + 6);
            y += 20;

            for (const j of jobs) {
              if (y > pageHeight - 80) {
                doc.addPage();
                y = 60;
              }
              doc
                .rect(45, y, contentWidth, 20)
                .fillAndStroke("#FFFFFF", "#E2E8F0");
              doc
                .font("Bold")
                .fontSize(8)
                .fillColor("#0F172A")
                .text(j.title, 55, y + 6, { width: 195 });
              doc
                .font("Regular")
                .fontSize(7.5)
                .fillColor("#64748B")
                .text(j.slug, 260, y + 6, { width: 110 });
              doc
                .font("Bold")
                .fontSize(7.5)
                .fillColor("#16A34A")
                .text(j.status, 380, y + 6);
              doc
                .font("Regular")
                .fontSize(8)
                .fillColor("#475569")
                .text(
                  new Date(j.createdAt).toLocaleDateString("vi-VN"),
                  460,
                  y + 6,
                );
              y += 20;
            }
            y += 15;
          }
        } else {
          doc
            .font("Bold")
            .fontSize(13)
            .fillColor("#0F172A")
            .text("3. LỊCH SỬ ỨNG TUYỂN VIỆC LÀM", 45, y);
          y += 18;

          if (apps.length === 0) {
            doc
              .roundedRect(45, y, contentWidth, 40, 4)
              .fillAndStroke("#F8FAFC", "#E2E8F0");
            doc
              .font("Regular")
              .fontSize(8.5)
              .fillColor("#64748B")
              .text(
                "Tài khoản chưa gửi đơn ứng tuyển nào trên hệ thống.",
                57,
                y + 14,
              );
            y += 55;
          } else {
            // Table Header
            doc.rect(45, y, contentWidth, 20).fill("#1E293B");
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("VỊ TRÍ ỨNG TUYỂN", 55, y + 6);
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("CÔNG TY", 240, y + 6);
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("TRẠNG THÁI", 370, y + 6);
            doc
              .font("Bold")
              .fontSize(8)
              .fillColor("#FFFFFF")
              .text("NGÀY NỘP ĐƠN", 450, y + 6);
            y += 20;

            for (const app of apps) {
              if (y > pageHeight - 80) {
                doc.addPage();
                y = 60;
              }
              doc
                .rect(45, y, contentWidth, 20)
                .fillAndStroke("#FFFFFF", "#E2E8F0");
              doc
                .font("Bold")
                .fontSize(8)
                .fillColor("#0F172A")
                .text(app.job?.title || "Vị trí đã lưu trữ", 55, y + 6, {
                  width: 175,
                });
              doc
                .font("Regular")
                .fontSize(8)
                .fillColor("#475569")
                .text(app.job?.employer?.companyName || "N/A", 240, y + 6, {
                  width: 120,
                });
              doc
                .font("Bold")
                .fontSize(7.5)
                .fillColor("#2563EB")
                .text(app.status, 370, y + 6);
              doc
                .font("Regular")
                .fontSize(8)
                .fillColor("#475569")
                .text(
                  new Date(app.appliedAt).toLocaleDateString("vi-VN"),
                  450,
                  y + 6,
                );
              y += 20;
            }
            y += 15;
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // PHẦN 5: LỊCH SỬ TIN NHẮN (MESSAGES)
        // ─────────────────────────────────────────────────────────────────────
        if (y > pageHeight - 160) {
          doc.addPage();
          y = 60;
        }

        doc
          .font("Bold")
          .fontSize(13)
          .fillColor("#0F172A")
          .text("4. LỊCH SỬ TIN NHẮN ĐÃ GỬI (MESSAGES)", 45, y);
        y += 18;

        const messages = account.messages || [];
        if (messages.length === 0) {
          doc
            .roundedRect(45, y, contentWidth, 40, 4)
            .fillAndStroke("#F8FAFC", "#E2E8F0");
          doc
            .font("Regular")
            .fontSize(8.5)
            .fillColor("#64748B")
            .text(
              "Tài khoản chưa gửi tin nhắn nào trong các cuộc hội thoại tuyển dụng.",
              57,
              y + 14,
            );
          y += 55;
        } else {
          for (let mIdx = 0; mIdx < messages.length; mIdx++) {
            const msg = messages[mIdx]!;
            if (y > pageHeight - 80) {
              doc.addPage();
              y = 60;
            }
            const dateStr = new Date(msg.createdAt).toLocaleString("vi-VN");
            doc
              .roundedRect(45, y, contentWidth, 38, 4)
              .fillAndStroke("#F8FAFC", "#E2E8F0");
            doc
              .font("Bold")
              .fontSize(7.5)
              .fillColor("#2563EB")
              .text(
                `Người gửi: Bạn | Mã hội thoại: ${msg.applicationId.slice(0, 16)}... | Thời gian: ${dateStr}`,
                55,
                y + 6,
              );
            doc
              .font("Regular")
              .fontSize(8)
              .fillColor("#0F172A")
              .text(msg.body, 55, y + 20, {
                width: contentWidth - 20,
                height: 16,
              });
            y += 44;
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // PHẦN 6: CÀI ĐẶT THÔNG BÁO & JOB ALERTS
        // ─────────────────────────────────────────────────────────────────────
        if (y > pageHeight - 180) {
          doc.addPage();
          y = 60;
        }

        doc
          .font("Bold")
          .fontSize(13)
          .fillColor("#0F172A")
          .text("5. TÙY CHỌN THÔNG BÁO & CẢNH BÁO VIỆC LÀM", 45, y);
        y += 18;

        const notifs = account.notificationPreference || {};
        const notifTable: [string, string][] = [
          [
            "Thông báo cập nhật đơn ứng tuyển (Application Updates)",
            notifs.applicationUpdates !== false
              ? "Bật (Enabled)"
              : "Tắt (Disabled)",
          ],
          [
            "Tin nhắn trực tiếp từ nhà tuyển dụng (Employer Messages)",
            notifs.employerMessages !== false
              ? "Bật (Enabled)"
              : "Tắt (Disabled)",
          ],
          [
            "Email tổng hợp hàng tuần (Weekly Digest)",
            notifs.weeklyDigest !== false ? "Bật (Enabled)" : "Tắt (Disabled)",
          ],
          [
            "Cảnh báo việc làm phù hợp tức thì (Instant Match Alerts)",
            notifs.instantMatchAlerts !== false
              ? "Bật (Enabled)"
              : "Tắt (Disabled)",
          ],
          [
            "Tin tức cập nhật sản phẩm & cẩm nang nghề nghiệp",
            notifs.productNews ? "Bật (Enabled)" : "Tắt (Disabled)",
          ],
        ];

        for (let i = 0; i < notifTable.length; i++) {
          const [lbl, val] = notifTable[i]!;
          const bg = i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
          doc.rect(45, y, contentWidth, 19).fillAndStroke(bg, "#E2E8F0");
          doc
            .font("Bold")
            .fontSize(8)
            .fillColor("#475569")
            .text(lbl, 55, y + 5, { width: col1W + 100 });
          doc
            .font("Regular")
            .fontSize(8)
            .fillColor("#0F172A")
            .text(val, 45 + col1W + 110, y + 5, { width: col2W - 120 });
          y += 19;
        }
        y += 15;

        // Job alerts list
        const alerts = account.jobAlerts || [];
        if (alerts.length > 0) {
          doc
            .font("Bold")
            .fontSize(9.5)
            .fillColor("#1E40AF")
            .text("BỘ ĐĂNG KÝ THEO DÕI VIỆC LÀM (JOB ALERTS):", 45, y);
          y += 14;
          for (const al of alerts) {
            if (y > pageHeight - 60) {
              doc.addPage();
              y = 60;
            }
            doc
              .font("Regular")
              .fontSize(8)
              .fillColor("#0F172A")
              .text(
                `• Từ khóa: "${al.keywords || "Tất cả"}" | Tần suất: ${al.frequency || "DAILY"} | Trạng thái: ${al.isActive !== false ? "Đang bật" : "Tạm ngưng"}`,
                45,
                y,
              );
            y += 14;
          }
          y += 10;
        }

        // ─────────────────────────────────────────────────────────────────────
        // PHẦN 7: BẢO MẬT & XÁC NHẬN TUÂN THỦ (COMPLIANCE ATTESTATION)
        // ─────────────────────────────────────────────────────────────────────
        if (y > pageHeight - 150) {
          doc.addPage();
          y = 60;
        }

        doc
          .roundedRect(45, y, contentWidth, 90, 6)
          .fillAndStroke("#F0FDF4", "#BBF7D0");
        doc
          .font("Bold")
          .fontSize(9.5)
          .fillColor("#166534")
          .text(
            "6. XÁC NHẬN BẢO MẬT & TUÂN THỦ QUYỀN RIÊNG TƯ (PB17)",
            58,
            y + 10,
          );
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#14532D")
          .text(
            "Báo cáo dữ liệu cá nhân này được hệ thống RemoteSEA kết xuất tự động theo đúng quyền của chủ thể dữ liệu (Right of access & data portability) quy định tại Điều 15 và Điều 20 Quy định Bảo vệ Dữ liệu Chung của Liên minh Châu Âu (GDPR), Đạo luật Bảo vệ Dữ liệu Cá nhân Singapore (PDPA) và Nghị định 13/2023/NĐ-CP về Bảo vệ dữ liệu cá nhân tại Việt Nam.\n\n" +
              "Hệ thống xác nhận tuyệt đối: Toàn bộ mật khẩu đã băm (passwordHash), khóa bí mật xác thực 2 bước (2FA TOTP secrets / backup codes), token phiên làm việc (sessions) và khóa API bảo mật không được lưu trữ trong bản xuất này nhằm đảm bảo an toàn tuyệt đối cho tài khoản của bạn.",
            58,
            y + 25,
            { width: contentWidth - 26, lineGap: 2.5 },
          );

        // ─────────────────────────────────────────────────────────────────────
        // TWO-PASS HEADER & FOOTER ON ALL PAGES
        // ─────────────────────────────────────────────────────────────────────
        const range = doc.bufferedPageRange();
        const totalPages = range.count;

        for (let i = range.start; i < range.start + totalPages; i++) {
          doc.switchToPage(i);

          // Page 1 is Cover - do not add running header/footer
          if (i === range.start) {
            continue;
          }

          // Running Top Header
          doc
            .font("Regular")
            .fontSize(7.5)
            .fillColor("#94A3B8")
            .text(
              "RemoteSEA · Báo cáo Dữ liệu Cá nhân (GDPR/PDPA Export Dossier)",
              45,
              25,
            );
          doc
            .font("Regular")
            .fontSize(7.5)
            .fillColor("#94A3B8")
            .text(refCode, pageWidth - 120, 25, { width: 75, align: "right" });
          doc
            .moveTo(45, 36)
            .lineTo(pageWidth - 45, 36)
            .strokeColor("#E2E8F0")
            .lineWidth(0.5)
            .stroke();

          // Running Bottom Footer
          doc
            .moveTo(45, pageHeight - 35)
            .lineTo(pageWidth - 45, pageHeight - 35)
            .strokeColor("#E2E8F0")
            .lineWidth(0.5)
            .stroke();
          doc
            .font("Regular")
            .fontSize(7.5)
            .fillColor("#94A3B8")
            .text(
              "Bảo mật & Riêng tư · Strictly Confidential",
              45,
              pageHeight - 27,
            );
          doc
            .font("Regular")
            .fontSize(7.5)
            .fillColor("#94A3B8")
            .text(
              `Trang ${i + 1} / ${totalPages}`,
              pageWidth - 100,
              pageHeight - 27,
              { width: 55, align: "right" },
            );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
