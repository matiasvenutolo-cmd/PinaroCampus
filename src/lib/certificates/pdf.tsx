/* eslint-disable jsx-a11y/alt-text -- el <Image> de react-pdf dibuja en un PDF, no es un <img> del DOM */
import path from "node:path";

import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import type { CertificateSnapshot } from "@/lib/db/schema";

import { formatDni, formatHours, formatLongDate } from "./format";

// A4 apaisado (docs/06). Las fuentes viajan dentro del repo (Inter, OFL).
const FONT_DIR = path.join(process.cwd(), "src/lib/certificates/fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONT_DIR, "inter-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "inter-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    { src: path.join(FONT_DIR, "inter-latin-600-normal.woff"), fontWeight: 600 },
    { src: path.join(FONT_DIR, "inter-latin-700-normal.woff"), fontWeight: 700 },
  ],
});
// Sin cortes de palabra con guiones: los nombres propios no se parten.
Font.registerHyphenationCallback((word) => [word]);

/** Una imagen ya resuelta: `react-pdf` no dibuja SVG como `<Image>`, así que se pasan sus trazos. */
export type PdfPicture =
  | { kind: "raster"; src: string | { data: Buffer; format: "png" | "jpg" } }
  | { kind: "svg"; viewBox: [number, number, number, number]; paths: string[]; stroke: string };

export interface CertificatePdfData {
  code: string;
  holderName: string;
  holderDni: string | null;
  courseTitle: string;
  hours: string;
  score: number;
  issuedAt: Date;
  snapshot: CertificateSnapshot;
  verifyUrl: string;
  /** Texto corto con el dominio, sin protocolo, para imprimir. */
  verifyDisplay: string;
  qrDataUrl: string;
  logo: PdfPicture | null;
  signatures: (PdfPicture | null)[];
}

const GRAY = "#6B7280";
const INK = "#111827";

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", color: INK, backgroundColor: "#FFFFFF" },
  frame: { flex: 1, margin: 22, border: "0.75pt solid #D1D5DB", padding: "26pt 40pt 22pt 40pt" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", minHeight: 44 },
  logoImage: { height: 40, maxWidth: 200, objectFit: "contain", objectPosition: "left center" },
  chamberName: { fontSize: 15, fontWeight: 700, maxWidth: 360 },
  kicker: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textAlign: "right", color: GRAY, lineHeight: 1.4 },
  rule: { height: 3, marginTop: 10, marginBottom: 22 },
  body: { flexGrow: 1, alignItems: "center", textAlign: "center" },
  lead: { fontSize: 12, color: GRAY },
  holder: { fontWeight: 700, marginTop: 10, textAlign: "center" },
  dni: { fontSize: 11, color: GRAY, marginTop: 4 },
  passed: { fontSize: 12, color: GRAY, marginTop: 14 },
  course: { fontSize: 20, fontWeight: 700, marginTop: 6, textAlign: "center", maxWidth: 640, lineHeight: 1.25 },
  detail: { fontSize: 12, color: INK, marginTop: 10, lineHeight: 1.5 },
  signatories: { flexDirection: "row", justifyContent: "center", gap: 48, marginTop: 8, marginBottom: 12 },
  signatory: { width: 190, alignItems: "center" },
  signatureBox: { height: 38, width: 150, justifyContent: "flex-end", alignItems: "center" },
  signatureLine: { borderTop: "0.75pt solid #111827", width: 170, marginTop: 2, marginBottom: 4 },
  signatoryName: { fontSize: 10.5, fontWeight: 600, textAlign: "center" },
  signatoryRole: { fontSize: 9, color: GRAY, textAlign: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: 14, borderTop: "0.5pt solid #E5E7EB", paddingTop: 10 },
  qr: { width: 58, height: 58 },
  footerText: { flexGrow: 1, fontSize: 8.5, color: GRAY, lineHeight: 1.5 },
  footerStrong: { color: INK, fontWeight: 600 },
  brand: { fontSize: 8, color: "#9CA3AF", textAlign: "right" },
  customFooter: { fontSize: 8.5, color: GRAY, textAlign: "center", marginBottom: 8 },
});

/** Los nombres largos (40+ caracteres) bajan de tamaño y se parten en renglones en vez de salirse de la hoja. */
function holderFontSize(name: string): number {
  if (name.length <= 28) return 30;
  if (name.length <= 40) return 25;
  if (name.length <= 56) return 20;
  return 16;
}

function Picture({ picture, height, width }: { picture: PdfPicture; height: number; width: number }) {
  if (picture.kind === "raster") {
    return <Image src={picture.src} style={{ height, width, objectFit: "contain" }} />;
  }
  const [x, y, w, h] = picture.viewBox;
  return (
    <Svg viewBox={`${x} ${y} ${w} ${h}`} style={{ height, width }}>
      {picture.paths.map((d, index) => (
        <Path key={index} d={d} stroke={picture.stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

export function CertificateDocument({ data }: { data: CertificatePdfData }) {
  const { snapshot } = data;
  const dni = snapshot.showDni && data.holderDni ? formatDni(data.holderDni) : null;
  const holder = data.holderName.toLocaleUpperCase("es-AR");

  return (
    <Document title={`${snapshot.title} — ${data.courseTitle}`} author={snapshot.tenantName} subject={`Código ${data.code}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.frame}>
          <View style={styles.header}>
            {data.logo ? (
              <Picture picture={data.logo} height={40} width={160} />
            ) : (
              <Text style={styles.chamberName}>{snapshot.tenantName}</Text>
            )}
            <Text style={styles.kicker}>{snapshot.title.toLocaleUpperCase("es-AR")}</Text>
          </View>
          <View style={{ ...styles.rule, backgroundColor: snapshot.primaryColor }} />

          <View style={styles.body}>
            <Text style={styles.lead}>{snapshot.tenantName} certifica que</Text>
            <Text style={{ ...styles.holder, fontSize: holderFontSize(holder), maxWidth: 680 }}>{holder}</Text>
            {dni ? <Text style={styles.dni}>DNI {dni}</Text> : null}
            <Text style={styles.passed}>aprobó el curso</Text>
            <Text style={styles.course}>{data.courseTitle}</Text>
            <Text style={styles.detail}>
              con una carga horaria de {formatHours(data.hours)}, el {formatLongDate(data.issuedAt)}
              {snapshot.graded ? `, con una calificación de ${data.score}/100.` : "."}
            </Text>
          </View>

          {snapshot.signatories.length > 0 ? (
            <View style={styles.signatories}>
              {snapshot.signatories.map((signatory, index) => (
                <View key={`${signatory.name}-${index}`} style={styles.signatory}>
                  <View style={styles.signatureBox}>
                    {data.signatures[index] ? <Picture picture={data.signatures[index]!} height={36} width={140} /> : null}
                  </View>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatoryName}>{signatory.name}</Text>
                  <Text style={styles.signatoryRole}>{signatory.role}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {snapshot.footerText ? <Text style={styles.customFooter}>{snapshot.footerText}</Text> : null}

          <View style={styles.footer}>
            <Image src={data.qrDataUrl} style={styles.qr} />
            <View style={styles.footerText}>
              <Text>Verificá este certificado en</Text>
              <Text style={styles.footerStrong}>{data.verifyDisplay}</Text>
              <Text>
                Código: <Text style={styles.footerStrong}>{data.code}</Text>
              </Text>
            </View>
            <Text style={styles.brand}>Plataforma provista por Pinaro</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
