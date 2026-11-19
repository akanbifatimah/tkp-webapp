/** Build-time settings (Vite bakes VITE_* in at build time). */
export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, ""),
  useMocks: import.meta.env.VITE_USE_MOCKS !== "false",
} as const;
