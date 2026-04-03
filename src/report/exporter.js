"use strict";

const fs = require("fs");
const path = require("path");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHtml(result) {
  const pretty = escapeHtml(JSON.stringify(result, null, 2));
  return `<!doctype html><html><head><meta charset=\"utf-8\"><title>agents-runtime report</title><style>body{font-family:ui-monospace,Consolas,monospace;padding:24px;background:#f7f7f8;color:#111}pre{white-space:pre-wrap;background:#fff;border:1px solid #ddd;padding:16px;border-radius:8px}</style></head><body><h1>agents-runtime report</h1><pre>${pretty}</pre></body></html>`;
}

function toMinimalPdf(text) {
  const safe = String(text).replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 72 740 Td (${safe.slice(0, 3000)}) Tj ET`;
  const len = stream.length;
  return `%PDF-1.1\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length ${len} >>stream\n${stream}\nendstream endobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000062 00000 n \n0000000122 00000 n \n0000000274 00000 n \n0000000360 00000 n \ntrailer<< /Root 1 0 R /Size 6 >>\nstartxref\n430\n%%EOF`;
}

function exportReport({ result, outputPath, format = "json" }) {
  const abs = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const normalized = String(format).toLowerCase();
  if (normalized === "json") {
    fs.writeFileSync(abs, JSON.stringify(result, null, 2), "utf8");
    return abs;
  }
  if (normalized === "html") {
    fs.writeFileSync(abs, toHtml(result), "utf8");
    return abs;
  }
  if (normalized === "pdf") {
    fs.writeFileSync(abs, toMinimalPdf(JSON.stringify(result, null, 2)), "utf8");
    return abs;
  }

  throw new Error(`Unsupported export format: ${format}`);
}

module.exports = { exportReport, toHtml, toMinimalPdf };
