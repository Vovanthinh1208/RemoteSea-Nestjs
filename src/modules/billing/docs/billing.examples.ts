/** Request/response example payloads for the Billing module's Swagger docs. */

export const CheckoutRequestExample = { jobId: "cme8f1a2b0000ug0h9x1n1a2" };

export const CheckoutResponseExample = { url: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3..." };

export const WebhookResponseExample = { received: true };

export const ValidationErrorExample = {
  error: { formErrors: [], fieldErrors: { jobId: ["Invalid cuid"] } },
};

export const JobNotPayableExample = { error: "Job is not payable" };

export const JobNotFoundExample = { error: "Job not found" };

export const MissingSignatureExample = { error: "Missing signature" };

export const InvalidSignatureExample = { error: "Invalid signature" };
