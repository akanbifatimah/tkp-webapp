/** Build-time settings (Vite bakes VITE_* in at build time). */
export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, ""),
  useMocks: import.meta.env.VITE_USE_MOCKS !== "false",
  /** The developer UI kit (/dev/ui). Off unless asked for, and never without mocks, so demos stay clean. */
  showUiKit: import.meta.env.VITE_USE_MOCKS !== "false" && import.meta.env.VITE_SHOW_UI_KIT === "true",
} as const;
