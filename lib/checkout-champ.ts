// ─────────────────────────────────────────────────────────────────────────────
// Checkout Champ API client.
//
// Every CC call is a POST with form-style body containing `loginId` +
// `password` plus the operation's params. Responses are JSON of the shape:
//   { result: "SUCCESS" | "ERROR" | "DECLINE" | "MERC_REDIRECT" | "UNKNOWN",
//     message: string | object,
//     ...optional fields }
//
// We treat:
//   - SUCCESS         → resolve with `message` (typed per call)
//   - MERC_REDIRECT   → resolve with `{ requires3DS: true, redirectUrl, script? }`
//   - everything else → throw CCError (caller handles decline / missing-fields / etc.)
//
// The CC docs accept either GET querystring or POST body; we always POST so
// PAN never lands in URLs / access logs / referers.
//
// IMPORTANT: this lib runs server-side only (it reads CHECKOUT_CHAMP_PASSWORD
// from env). Never import from a client component.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = (process.env.CHECKOUT_CHAMP_API_BASE || "https://api.checkoutchamp.com").replace(/\/$/, "");
const MAX_NETWORK_RETRIES = 3;
const RETRY_BACKOFF_MS = 250;

export class CCError extends Error {
  result: string;
  rawMessage: unknown;
  endpoint: string;
  status: number;
  constructor(opts: { endpoint: string; result: string; message: string; rawMessage?: unknown; status?: number }) {
    super(opts.message);
    this.name = "CCError";
    this.endpoint = opts.endpoint;
    this.result = opts.result;
    this.rawMessage = opts.rawMessage;
    this.status = opts.status ?? 0;
  }
}

interface CCResponseEnvelope {
  result: "SUCCESS" | "ERROR" | "DECLINE" | "MERC_REDIRECT" | "UNKNOWN" | string;
  message: unknown;
  url?: string;
  script?: string;
}

interface CCAuthCreds {
  loginId: string;
  password: string;
}

function getCreds(): CCAuthCreds {
  const loginId = process.env.CHECKOUT_CHAMP_LOGIN_ID;
  const password = process.env.CHECKOUT_CHAMP_PASSWORD;
  if (!loginId || !password) {
    throw new CCError({
      endpoint: "(auth)",
      result: "ERROR",
      message: "Checkout Champ credentials not configured (CHECKOUT_CHAMP_LOGIN_ID / CHECKOUT_CHAMP_PASSWORD)",
    });
  }
  return { loginId, password };
}

// CC uses different field names than the natural JS ones. Translate at the
// boundary so wrappers keep the friendly names.
const CC_FIELD_RENAME: Record<string, string> = {
  email: "emailAddress",
  phone: "phoneNumber",
  pageNum: "page",
};

function toFormBody(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [rawKey, v] of Object.entries(body)) {
    if (v == null) continue;
    const k = CC_FIELD_RENAME[rawKey] ?? rawKey;
    if (Array.isArray(v) || typeof v === "object") {
      params.set(k, JSON.stringify(v));
    } else {
      params.set(k, String(v));
    }
  }
  return params.toString();
}

async function ccPost<T = unknown>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T | { requires3DS: true; redirectUrl?: string; script?: string }> {
  const creds = getCreds();
  const fullBody = { loginId: creds.loginId, password: creds.password, ...body };
  const url = `${API_BASE}${endpoint}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: toFormBody(fullBody),
      });

      // Retry on 5xx but not 4xx (4xx = our bug, no point retrying)
      if (res.status >= 500 && attempt < MAX_NETWORK_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
        lastErr = new CCError({ endpoint, result: "ERROR", message: `HTTP ${res.status}`, status: res.status });
        continue;
      }

      const text = await res.text();
      let parsed: CCResponseEnvelope;
      try {
        parsed = JSON.parse(text) as CCResponseEnvelope;
      } catch {
        throw new CCError({
          endpoint,
          result: "ERROR",
          message: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
          status: res.status,
        });
      }

      if (parsed.result === "SUCCESS") return parsed.message as T;

      if (parsed.result === "MERC_REDIRECT") {
        return {
          requires3DS: true as const,
          redirectUrl: parsed.url,
          script: parsed.script,
        };
      }

      // Anything else — DECLINE / ERROR / UNKNOWN — surface as throw
      const msg = typeof parsed.message === "string" ? parsed.message : JSON.stringify(parsed.message);
      throw new CCError({
        endpoint,
        result: parsed.result,
        message: msg,
        rawMessage: parsed.message,
        status: res.status,
      });
    } catch (err) {
      // CCError from non-2xx — don't retry, throw immediately
      if (err instanceof CCError) throw err;
      lastErr = err;
      if (attempt < MAX_NETWORK_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
    }
  }

  throw new CCError({
    endpoint,
    result: "ERROR",
    message: `Network error after ${MAX_NETWORK_RETRIES + 1} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed wrappers — one per CC endpoint we use.
// Field shapes lifted from "Checkout Champ APIs.pdf". When response shapes
// drift in production, fix here and the rest of the codebase keeps working.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportLeadInput {
  campaignId: number | string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  ipAddress?: string;
  // optional custom fields prefixed with `custom_`
  [k: string]: unknown;
}
export interface ImportLeadResult {
  orderId?: string;
  customerId?: number | string;
  [k: string]: unknown;
}
export function importLead(input: ImportLeadInput) {
  return ccPost<ImportLeadResult>("/leads/import/", input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Click — first call in a CC funnel session. Returns a sessionId that
// must be passed on subsequent Import Order / Import Upsale calls so CC ties
// the customer's order chain together (and reuses the original payment source
// on upsells without needing fresh card data).
// ─────────────────────────────────────────────────────────────────────────────
export interface ImportClickInput {
  campaignId?: number | string;
  sessionId?: string;
  pageType?: string; // 'leadPage' | 'checkoutPage' | 'upsellPage1'..'upsellPage4' | 'thankyouPage'
  ipAddress?: string;
  httpReferer?: string;
  [k: string]: unknown;
}
export interface ImportClickResult {
  sessionId?: string;
  pixel?: boolean;
  [k: string]: unknown;
}
export async function importClick(input: ImportClickInput): Promise<ImportClickResult> {
  // Import Click never returns the 3DS redirect branch, so narrow the type.
  const r = await ccPost<ImportClickResult>("/landers/clicks/import/", input);
  if (isMerchRedirect(r)) return {} as ImportClickResult;
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Upsale — bills an upsell against an existing order's stored payment
// source. Required when the original purchase used Apple Pay / Google Pay,
// because wallet tokens aren't reusable through plain Import Order.
//
// Per CC support: must include `orderId` (from original Import Order response)
// AND `sessionId` (from Import Click that started the funnel session).
// ─────────────────────────────────────────────────────────────────────────────
export interface ImportUpsaleInput {
  orderId: string;
  sessionId?: string;
  campaignId?: number | string;
  product1_id: number | string;
  product1_qty?: number;
  product1_price?: string | number;
  product1_shipPrice?: string | number;
  customDescriptor?: string;
  // 3DS pass-through fields
  cavv?: string;
  eci?: string;
  errorRedirectsTo?: string;
  [k: string]: unknown;
}
export interface ImportUpsaleResult {
  orderId: string;
  totalAmount?: string | number;
  [k: string]: unknown;
}
// ─────────────────────────────────────────────────────────────────────────────
// Confirm Order — fires the funnel-end "thank you" event in CC. This is what
// triggers postback exports and confirmation emails per CC support. Should be
// called once per orderId after the customer finishes upsells.
// ─────────────────────────────────────────────────────────────────────────────
export interface ConfirmOrderInput {
  orderId: string;
  [k: string]: unknown;
}
export async function confirmOrder(input: ConfirmOrderInput): Promise<unknown> {
  const r = await ccPost<unknown>("/order/confirm/", input);
  if (isMerchRedirect(r)) return null;
  return r;
}

export async function importUpsale(input: ImportUpsaleInput): Promise<ImportUpsaleResult> {
  const r = await ccPost<ImportUpsaleResult>("/upsale/import/", input);
  if (isMerchRedirect(r)) {
    throw new CCError({
      endpoint: "/upsale/import/",
      result: "ERROR",
      message: "Import Upsale unexpectedly returned 3DS redirect",
    });
  }
  return r;
}

export interface ImportOrderInput {
  campaignId: number | string;
  paySource: "CREDITCARD" | "APPLEPAY" | "GOOGLEPAY" | "ACCTONFILE";
  // Card fields — required when paySource = CREDITCARD; ignored otherwise.
  cardNumber?: string;
  cardExpiryDate?: string; // mm/yy or mm/yyyy
  cardSecurityCode?: string;
  // Wallet token fields — required for the matching paySource.
  applePayToken?: string;  // JSON-encoded ApplePayPayment.token
  googlePayToken?: string; // raw token string from Google Pay
  email: string;
  firstName?: string;
  lastName?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone?: string;
  ipAddress?: string;
  billShipSame?: 0 | 1 | "0" | "1";
  product1_id: number | string;
  product1_qty?: number;
  product1_price?: string;
  redirectsTo?: string;
  errorRedirectsTo?: string;
  browserData?: string;
  // 3DS pass-through fields — set when the client already authenticated the
  // cardholder via an external 3DS provider (e.g. PAAY). Forwarded to the
  // gateway as the auth proof so liability shifts to the issuer without CC
  // needing to run its own redirect-based 3DS challenge.
  // 3DS pass-through field names per CC's PAAY integration doc:
  //   cavv          ← PAAY.authenticationValue
  //   xid           ← PAAY.dsTransId
  //   eci           ← PAAY.eci
  //   acsTransId    ← PAAY.acsTransId
  //   threeDsStatus ← PAAY.status
  cavv?: string;
  eci?: string;
  xid?: string;
  acsTransId?: string;
  threeDsStatus?: string;
  [k: string]: unknown;
}
export interface ImportOrderResult {
  orderId: string;
  customerId: number | string;
  totalAmount?: string | number;
  [k: string]: unknown;
}
export async function importOrder(input: ImportOrderInput): Promise<ImportOrderResult | { requires3DS: true; redirectUrl?: string; script?: string }> {
  return ccPost<ImportOrderResult>("/order/import/", input);
}

export interface PreauthOrderInput {
  campaignId: number | string;
  cardNumber: string;
  cardExpiryDate: string;
  cardSecurityCode: string;
  email: string;
  address1: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  [k: string]: unknown;
}
export interface PreauthResult {
  preauth: boolean;
  customerId?: number | string;
  [k: string]: unknown;
}
export function preauthOrder(input: PreauthOrderInput) {
  return ccPost<PreauthResult>("/order/preauth/", input);
}

export interface QueryCustomerInput {
  email?: string;
  customerId?: number | string;
  [k: string]: unknown;
}
export interface QueryCustomerResultRow {
  customerId: number | string;
  // CC's response uses `emailAddress` (their canonical naming, same as the
  // outbound rename in toFormBody). Some older endpoints / shapes return
  // `email`. Read both when matching — see findCcCustomerByEmail.
  email?: string;
  emailAddress?: string;
  firstName?: string;
  lastName?: string;
  paySources?: Array<{ paySourceId: number | string; lastFour?: string; cardType?: string }>;
  [k: string]: unknown;
}
// Import + re-export from shared timezone module.
import { ccDateFmt } from "@/lib/cc-timezone";
export { ccDateFmt };

export async function queryCustomer(input: QueryCustomerInput): Promise<{ totalResults: number; data?: QueryCustomerResultRow[] }> {
  const body: QueryCustomerInput = { ...input };
  if (!body.customerId) {
    if (!body.startDate) {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      body.startDate = ccDateFmt(fiveYearsAgo);
    }
    if (!body.endDate) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      body.endDate = ccDateFmt(tomorrow);
    }
  }
  const result = await ccPost<{ totalResults: number; data?: QueryCustomerResultRow[] }>(
    "/customer/query/",
    body,
  );
  // queryCustomer never produces a 3DS redirect — strip that branch.
  if (isMerchRedirect(result)) {
    throw new CCError({
      endpoint: "/customer/query/",
      result: "ERROR",
      message: "Unexpected MERC_REDIRECT from queryCustomer",
    });
  }
  return result;
}

export interface QueryCustomerHistoryInput {
  customerId?: number | string;
  email?: string;
  categoryType?: string;
  startDate?: string;
  endDate?: string;
  [k: string]: unknown;
}
export async function queryCustomerHistory(input: QueryCustomerHistoryInput): Promise<{ totalResults: number; data?: Array<Record<string, unknown>> }> {
  const result = await ccPost<{ totalResults: number; data?: Array<Record<string, unknown>> }>(
    "/customer/history/",
    input,
  );
  if (isMerchRedirect(result)) {
    throw new CCError({
      endpoint: "/customer/history/",
      result: "ERROR",
      message: "Unexpected MERC_REDIRECT from queryCustomerHistory",
    });
  }
  return result;
}

export interface RefundOrderInput {
  orderId: string;
  refundAmount?: number;
  fullRefund?: boolean;
  refundReason?: string;
  [k: string]: unknown;
}
export function refundOrder(input: RefundOrderInput) {
  return ccPost<unknown>("/order/refund/", input);
}

export interface RefundTransactionInput {
  transactionId: number | string;
  refundAmount?: number;
  fullRefund?: boolean;
  refundReason?: string;
  externalRefund?: boolean;
  cancelPurchase?: boolean;
  [k: string]: unknown;
}
export function refundTransaction(input: RefundTransactionInput) {
  return ccPost<unknown>("/transactions/refund/", input);
}

// /transactions/query/ — used by the reconciler to pull renewals, refunds,
// chargebacks since the last cursor. Date strings must be mm/dd/yyyy per CC
// API. Pagination via `pageNum` (1-indexed). One page at a time; the caller
// loops until results < pageSize.
export interface QueryTransactionsInput {
  startDate?: string; // mm/dd/yyyy
  endDate?: string;   // mm/dd/yyyy
  pageNum?: number;
  resultsPerPage?: number;
  customerId?: number | string;
  campaignId?: number | string;
  [k: string]: unknown;
}
export interface QueryTransactionsRow {
  transactionId?: string;
  orderId?: string;
  customerId?: number | string;
  amount?: number | string;
  amountRefunded?: number | string;
  // CC `responseType` values seen: "SUCCESS", "FAILED", "ERROR", "DECLINED",
  // "CHARGEBACK", "REFUND". Not all are documented; we treat unknowns as
  // SUCCESS so we don't drop revenue silently.
  responseType?: string;
  // CC `transactionType` values: "NEW_SALE" (initial), "REBILL" (renewal),
  // "REFUND", "CHARGEBACK", "VOID".
  transactionType?: string;
  transactionDate?: string;
  campaignId?: number | string;
  productId?: number | string;
  isRebill?: boolean | number | string;
  [k: string]: unknown;
}
export async function queryTransactions(
  input: QueryTransactionsInput,
): Promise<{ totalResults: number; data?: QueryTransactionsRow[] }> {
  const r = await ccPost<{ totalResults: number; data?: QueryTransactionsRow[] }>(
    "/transactions/query/",
    input,
  );
  if (isMerchRedirect(r)) return { totalResults: 0, data: [] };
  return r;
}

export interface QueryPurchaseInput {
  customerId?: number | string;
  email?: string;
  purchaseId?: string;
  orderId?: string;
  startDate?: string; // mm/dd/yyyy
  endDate?: string;   // mm/dd/yyyy
  [k: string]: unknown;
}
export interface QueryPurchaseRow {
  purchaseId: string;
  customerId?: number | string;
  orderId?: string;
  isActive?: boolean | number | string;
  nextBillDate?: string;
  cancelDate?: string;
  productId?: number | string;
  [k: string]: unknown;
}
export async function queryPurchase(input: QueryPurchaseInput): Promise<{ totalResults: number; data?: QueryPurchaseRow[] }> {
  const body: QueryPurchaseInput = { ...input };
  // CC requires either purchaseId/orderId/customerId, OR a date range. If
  // only customerId is supplied we still need to send a default range.
  if (!body.purchaseId && !body.orderId) {
    if (!body.startDate) {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const m = String(fiveYearsAgo.getMonth() + 1).padStart(2, "0");
      const d = String(fiveYearsAgo.getDate()).padStart(2, "0");
      body.startDate = `${m}/${d}/${fiveYearsAgo.getFullYear()}`;
    }
    if (!body.endDate) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const d = String(tomorrow.getDate()).padStart(2, "0");
      body.endDate = `${m}/${d}/${tomorrow.getFullYear()}`;
    }
  }
  const r = await ccPost<{ totalResults: number; data?: QueryPurchaseRow[] }>(
    "/purchase/query/",
    body,
  );
  if (isMerchRedirect(r)) return { totalResults: 0, data: [] };
  return r;
}

export interface CancelPurchaseInput {
  purchaseId: string;
  cancelReason: string;
  afterNextBill?: boolean;
  cancelFulfillment?: boolean;
  fullRefund?: boolean;
  [k: string]: unknown;
}
export function cancelPurchase(input: CancelPurchaseInput) {
  return ccPost<unknown>("/purchase/cancel/", input);
}

export interface PausePurchaseInput {
  purchaseId: string;
  restartDate: string;
  priorToNextBill?: boolean;
  [k: string]: unknown;
}
export function pausePurchase(input: PausePurchaseInput) {
  return ccPost<unknown>("/purchase/pause/", input);
}

export interface UpdateCustomerCardInput {
  customerId: number | string;
  cardNumber: string;
  cardMonth: string; // mm
  cardYear: string;  // yyyy
  cardSecurityCode?: string;
  paySourceId?: number | string;
  [k: string]: unknown;
}
export function updateCustomerCard(input: UpdateCustomerCardInput) {
  return ccPost<unknown>("/customer/cardupdate/", input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Find — returns full order details including custom fields.
// CC's /order/find/ accepts orderId and returns the order with all metadata
// that /transactions/query/ strips out.
// ─────────────────────────────────────────────────────────────────────────────
export interface OrderFindResult {
  orderId: string;
  customerId?: number | string;
  emailAddress?: string;
  [k: string]: unknown;
}
export async function orderFind(orderId: string): Promise<OrderFindResult> {
  const r = await ccPost<OrderFindResult>("/order/view/", { orderId });
  if (isMerchRedirect(r)) {
    throw new CCError({ endpoint: "/order/view/", result: "ERROR", message: "Unexpected MERC_REDIRECT" });
  }
  return r;
}

export interface CaptureTransactionInput {
  orderId?: string;
  transactionId?: number | string;
  [k: string]: unknown;
}
export function captureTransaction(input: CaptureTransactionInput) {
  return ccPost<unknown>("/transactions/capture/", input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract flow_id from a CC transaction/order/purchase row.
//
// CC stores our `custom_flow_id` in one of the per-account `custom1`..
// `custom5` slots — the field name is NOT echoed back consistently across
// endpoint versions. Try named keys first, then numbered custom slots
// (only accepting slug-shaped values), then wildcard-scan for any key
// containing "flow".
// ─────────────────────────────────────────────────────────────────────────────
export function extractCustomFlowId(row: QueryTransactionsRow): string | null {
  const r = row as Record<string, unknown>;
  const namedCandidates: Array<unknown> = [
    r.custom_flow_id,
    r.customFlowId,
    (r.customFields as Record<string, unknown> | undefined)?.custom_flow_id,
    (r.customFields as Record<string, unknown> | undefined)?.customFlowId,
    (r.custom as Record<string, unknown> | undefined)?.flow_id,
    (r.extras as Record<string, unknown> | undefined)?.custom_flow_id,
    (r.meta as Record<string, unknown> | undefined)?.custom_flow_id,
  ];
  for (const v of namedCandidates) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Numbered slots. Only return if the value looks like a flow id slug
  // (lowercase alphanumeric + underscore, short) — avoids attributing a
  // free-text custom field to flow attribution by mistake.
  for (const slot of ["custom1", "custom2", "custom3", "custom4", "custom5"]) {
    const v = r[slot];
    if (typeof v === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(v)) return v;
  }
  for (const [k, v] of Object.entries(row)) {
    if (/flow/i.test(k) && typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

// Type guard for the 3DS redirect branch returned by importOrder
export function isMerchRedirect(
  result: unknown,
): result is { requires3DS: true; redirectUrl?: string; script?: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { requires3DS?: unknown }).requires3DS === true
  );
}
