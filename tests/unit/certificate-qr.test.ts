import jsQR from "jsqr";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

// El PDF embebe exactamente este PNG (`buildPdfData`): si decodifica al link
// de verificación, escanear el QR abre `/verificar/<código>`.
describe("QR del certificado", () => {
  it("decodifica al link de verificación", async () => {
    const verifyUrl = "https://plataforma.pinaro.ar/verificar/PC-7K3M-Q9TD";
    const dataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 320, errorCorrectionLevel: "M" });
    const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(verifyUrl);
  });
});
