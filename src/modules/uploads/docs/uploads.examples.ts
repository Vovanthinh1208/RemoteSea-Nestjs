/** Request/response example payloads for the Uploads module's Swagger docs. */

export const PresignRequestExample = {
  type: "resume",
  filename: "resume.pdf",
  contentType: "application/pdf",
  fileSize: 245_760,
};

export const PresignResponseExample = {
  uploadUrl: "https://s3.amazonaws.com/bucket-name/uploads/resume/.../1751443200000-resume.pdf?X-Amz-Signature=...",
  publicUrl: "https://cdn.remotesea.io/uploads/resume/.../1751443200000-resume.pdf",
  key: "uploads/resume/.../1751443200000-resume.pdf",
};

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { contentType: ["Required"] } },
};

export const UnsupportedContentTypeExample = { error: "Unsupported content type" };

export const FileTooLargeExample = { error: "File too large — max 10MB for resume" };
