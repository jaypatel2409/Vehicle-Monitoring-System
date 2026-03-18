import dotenv from "dotenv";

dotenv.config();

export interface HikCentralConfig {
  useMock: boolean;
  baseUrl: string;
  appKey: string;
  appSecret: string;
  allowSelfSigned: boolean;

  timeoutMs: number;

  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;

  timeSkewToleranceMs: number;

  vehicleEventsPath: string;

  pageSize: number;
  maxPagesPerPoll: number;

  overlapMs: number;
  initialLookbackMs: number;

  pollIntervalMs: number;
}

function envBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

function envInt(value: string | undefined, defaultValue: number): number {
  if (!value || value.trim() === "") return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function requireEnv(name: string, value?: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

export const hikCentralConfig: HikCentralConfig = (() => {
  const useMock = envBool(process.env.HIKCENTRAL_USE_MOCK, false);

  const allowSelfSigned =
    process.env.NODE_ENV === "development"
      ? envBool(process.env.HIKCENTRAL_ALLOW_SELF_SIGNED, true)
      : envBool(process.env.HIKCENTRAL_ALLOW_SELF_SIGNED, false);

  if (useMock) {
    console.log("⚠️ HikCentral running in MOCK mode");

    return {
      useMock: true,
      baseUrl: "",
      appKey: "",
      appSecret: "",
      allowSelfSigned,

      timeoutMs: envInt(process.env.HIKCENTRAL_TIMEOUT_MS, 15000),

      maxRetries: envInt(process.env.HIKCENTRAL_MAX_RETRIES, 3),
      retryBaseDelayMs: envInt(process.env.HIKCENTRAL_RETRY_BASE_DELAY_MS, 300),
      retryMaxDelayMs: envInt(process.env.HIKCENTRAL_RETRY_MAX_DELAY_MS, 5000),

      timeSkewToleranceMs: envInt(
        process.env.HIKCENTRAL_TIME_SKEW_TOLERANCE_MS,
        2 * 60 * 1000
      ),

      vehicleEventsPath:
        process.env.HIKCENTRAL_VEHICLE_EVENTS_PATH ||
        '/artemis/api/pms/v1/crossRecords/page',

      pageSize: envInt(process.env.HIKCENTRAL_PAGE_SIZE, 50),
      maxPagesPerPoll: envInt(process.env.HIKCENTRAL_MAX_PAGES_PER_POLL, 20),

      overlapMs: envInt(process.env.HIKCENTRAL_OVERLAP_MS, 60000),

      initialLookbackMs: envInt(
        process.env.HIKCENTRAL_INITIAL_LOOKBACK_MS,
        5 * 60 * 1000
      ),

      pollIntervalMs:
        envInt(process.env.HIKCENTRAL_POLL_INTERVAL_SECONDS, 10) * 1000,
    };
  }

  const baseUrl = normalizeBaseUrl(
    requireEnv("HIKCENTRAL_BASE_URL", process.env.HIKCENTRAL_BASE_URL)
  );

  const appKey = requireEnv("HIKCENTRAL_APP_KEY", process.env.HIKCENTRAL_APP_KEY);

  const appSecret = requireEnv(
    "HIKCENTRAL_APP_SECRET",
    process.env.HIKCENTRAL_APP_SECRET
  );

  const config: HikCentralConfig = {
    useMock: false,
    baseUrl,
    appKey,
    appSecret,
    allowSelfSigned,

    timeoutMs: envInt(process.env.HIKCENTRAL_TIMEOUT_MS, 15000),

    maxRetries: envInt(process.env.HIKCENTRAL_MAX_RETRIES, 3),
    retryBaseDelayMs: envInt(process.env.HIKCENTRAL_RETRY_BASE_DELAY_MS, 300),
    retryMaxDelayMs: envInt(process.env.HIKCENTRAL_RETRY_MAX_DELAY_MS, 5000),

    timeSkewToleranceMs: envInt(
      process.env.HIKCENTRAL_TIME_SKEW_TOLERANCE_MS,
      2 * 60 * 1000
    ),

    vehicleEventsPath:
      process.env.HIKCENTRAL_VEHICLE_EVENTS_PATH ||
      '/artemis/api/pms/v1/crossRecords/page',

    pageSize: envInt(process.env.HIKCENTRAL_PAGE_SIZE, 50),
    maxPagesPerPoll: envInt(process.env.HIKCENTRAL_MAX_PAGES_PER_POLL, 20),

    overlapMs: envInt(process.env.HIKCENTRAL_OVERLAP_MS, 60000),

    initialLookbackMs: envInt(
      process.env.HIKCENTRAL_INITIAL_LOOKBACK_MS,
      5 * 60 * 1000
    ),

    pollIntervalMs:
      envInt(process.env.HIKCENTRAL_POLL_INTERVAL_SECONDS, 10) * 1000,
  };

  console.log("🔗 HikCentral Configuration Loaded");
  console.log("Base URL:", config.baseUrl);
  console.log("Allow Self Signed:", config.allowSelfSigned);
  console.log("Polling Interval:", config.pollIntervalMs, "ms");

  return config;
})();

export default hikCentralConfig;