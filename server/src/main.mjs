import { createApp } from "./app.mjs";

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`Missing ${k}; see env.example`); process.exit(1); }
  return v;
};
const app = createApp({
  dataDir: process.env.DATA_DIR ?? "/data",
  publicFileOrigin: need("PUBLIC_FILE_ORIGIN"),
  allowedOrigins: need("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean),
  maxPdfBytes: Number(process.env.MAX_PDF_MB ?? 200) * 1024 * 1024,
  trustProxy: process.env.TRUST_PROXY === "1",
});
const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => console.log(`imd-daily-files listening on ${port}`));
