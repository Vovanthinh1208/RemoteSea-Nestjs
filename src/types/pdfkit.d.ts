declare module "pdfkit" {
  export interface PDFDocumentOptions {
    size?: string | [number, number];
    layout?: "portrait" | "landscape";
    margins?: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    info?: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      CreationDate?: Date;
    };
    bufferPages?: boolean;
    autoFirstPage?: boolean;
    compress?: boolean;
  }

  export class PDFDocument {
    constructor(options?: PDFDocumentOptions);
    page: {
      width: number;
      height: number;
      margins: { top: number; bottom: number; left: number; right: number };
    };
    x: number;
    y: number;
    info: Record<string, any>;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(pageIndex: number): void;
    addPage(options?: PDFDocumentOptions): this;
    pipe<T extends NodeJS.WritableStream>(destination: T, options?: any): T;
    end(): void;
    fontSize(size: number): this;
    font(src: string, family?: string, size?: number): this;
    registerFont(name: string, src: string, family?: string): this;
    fillColor(color: string | [number, number, number], opacity?: number): this;
    strokeColor(
      color: string | [number, number, number],
      opacity?: number,
    ): this;
    fill(color?: string): this;
    stroke(color?: string): this;
    fillAndStroke(fillColor?: string, strokeColor?: string): this;
    rect(x: number, y: number, w: number, h: number): this;
    roundedRect(x: number, y: number, w: number, h: number, r: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    lineWidth(w: number): this;
    text(text: string, x?: number, y?: number, options?: any): this;
    text(text: string, options?: any): this;
    heightOfString(text: string, options?: any): number;
    widthOfString(text: string, options?: any): number;
    save(): this;
    restore(): this;
    on(event: string, callback: (...args: any[]) => void): this;
  }

  const PDFDoc: typeof PDFDocument;
  export default PDFDoc;
}
