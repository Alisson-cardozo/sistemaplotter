export type DeliveryFileFormat = "pdf" | "svg" | "png" | "all";

export type RawDeliveryFile = {
  filename: string;
  contentType?: string;
  content?: string;
  contentBase64?: string;
  region?: string;
  divisionId?: string;
  divisionName?: string;
};

export type PreparedDeliveryFile = {
  filename: string;
  contentType: string;
  contentBase64: string;
  region?: string;
  divisionId?: string;
  divisionName?: string;
};

function isSvgFile(file: RawDeliveryFile) {
  return (file.contentType || "").includes("svg") || file.filename.toLowerCase().endsWith(".svg");
}

function isPdfFile(file: RawDeliveryFile) {
  return (file.contentType || "").includes("pdf") || file.filename.toLowerCase().endsWith(".pdf");
}

function isCsvFile(file: RawDeliveryFile) {
  return (file.contentType || "").includes("csv") || file.filename.toLowerCase().endsWith(".csv");
}

function replaceExtension(filename: string, extension: string) {
  return filename.replace(/\.[^.]+$/u, extension);
}

export function deliveryFormatLabel(format: DeliveryFileFormat) {
  if (format === "pdf") return "PDF";
  if (format === "svg") return "Photoshop (SVG editavel)";
  if (format === "png") return "PNG";
  return "Tudo junto";
}

export function deliveryFormatDescription(format: DeliveryFileFormat) {
  if (format === "pdf") return "Arquivos em PDF para abrir no celular e em leitores comuns.";
  if (format === "svg") return "Arquivos vetoriais SVG, editaveis e compativeis com Photoshop e Illustrator.";
  if (format === "png") return "Arquivos em imagem PNG para abrir na galeria, WhatsApp e celular.";
  return "Envia PDF, PNG e SVG editavel juntos no mesmo pacote.";
}

export function base64FromText(content: string) {
  return btoa(unescape(encodeURIComponent(content)));
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error("Arquivo em formato invalido para conversao.");
  }

  return {
    contentType: match[1],
    base64: match[2]
  };
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel montar a imagem para envio."));
    image.src = src;
  });
}

async function svgToCanvas(svgContent: string) {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl);
    const width = Math.max(1, Math.ceil(image.naturalWidth || image.width || 1));
    const height = Math.max(1, Math.ceil(image.naturalHeight || image.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas indisponivel para preparar o envio.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildPdfFromJpegBase64(jpegBase64: string, pixelWidth: number, pixelHeight: number) {
  const jpegBinary = atob(jpegBase64);
  const pageWidth = Math.max(72, Math.round(pixelWidth * 0.75));
  const pageHeight = Math.max(72, Math.round(pixelHeight * 0.75));
  const imageObjectId = 4;
  const contentObjectId = 5;
  const imageStreamLength = jpegBinary.length;
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;

  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageStreamLength} >>\nstream\n${jpegBinary}\nendstream`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = new Array(objects.length).fill(0);

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return btoa(pdf);
}

function buildMultiPagePdfFromJpegs(pages: Array<{ jpegBase64: string; pixelWidth: number; pixelHeight: number }>) {
  if (!pages.length) {
    throw new Error("Nenhuma pagina foi gerada para montar o PDF.");
  }

  const objects: string[] = [""];
  const pageObjectIds: number[] = [];
  let nextObjectId = 3;

  for (const page of pages) {
    const jpegBinary = atob(page.jpegBase64);
    const pageWidth = Math.max(72, Math.round(page.pixelWidth * 0.75));
    const pageHeight = Math.max(72, Math.round(page.pixelHeight * 0.75));
    const pageObjectId = nextObjectId++;
    const imageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;

    pageObjectIds.push(pageObjectId);
    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[imageObjectId] = `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBinary.length} >>\nstream\n${jpegBinary}\nendstream`;
    objects[contentObjectId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = new Array(objects.length).fill(0);

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return btoa(pdf);
}

async function svgToPngBase64(svgContent: string) {
  const canvas = await svgToCanvas(svgContent);
  return parseDataUrl(canvas.toDataURL("image/png")).base64;
}

async function svgToPdfBase64(svgContent: string) {
  const canvas = await svgToCanvas(svgContent);
  const jpeg = parseDataUrl(canvas.toDataURL("image/jpeg", 0.92));
  return buildPdfFromJpegBase64(jpeg.base64, canvas.width, canvas.height);
}

export async function svgPagesToPdfBase64(svgContents: string[]) {
  const pages: Array<{ jpegBase64: string; pixelWidth: number; pixelHeight: number }> = [];

  for (const svgContent of svgContents) {
    const canvas = await svgToCanvas(svgContent);
    const jpeg = parseDataUrl(canvas.toDataURL("image/jpeg", 0.92));
    pages.push({
      jpegBase64: jpeg.base64,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height
    });
  }

  return buildMultiPagePdfFromJpegs(pages);
}

export async function buildAttachmentsFromRawFiles(files: RawDeliveryFile[], format: DeliveryFileFormat) {
  const prepared: PreparedDeliveryFile[] = [];

  for (const file of files) {
    const baseMeta = {
      region: file.region,
      divisionId: file.divisionId,
      divisionName: file.divisionName
    };

    if (isCsvFile(file)) {
      if (file.contentBase64) {
        prepared.push({
          filename: file.filename,
          contentType: file.contentType || "text/csv",
          contentBase64: file.contentBase64,
          ...baseMeta
        });
      } else if (typeof file.content === "string") {
        prepared.push({
          filename: file.filename,
          contentType: file.contentType || "text/csv",
          contentBase64: base64FromText(file.content),
          ...baseMeta
        });
      }
      continue;
    }

    if (isPdfFile(file) && (format === "pdf" || format === "all")) {
      const contentBase64 = file.contentBase64 ?? (typeof file.content === "string" ? base64FromText(file.content) : "");
      if (contentBase64) {
        prepared.push({
          filename: file.filename,
          contentType: file.contentType || "application/pdf",
          contentBase64,
          ...baseMeta
        });
      }
      continue;
    }

    if (!isSvgFile(file) || typeof file.content !== "string") {
      const contentBase64 = file.contentBase64 ?? "";
      if (contentBase64 && (format === "all" || format === "svg")) {
        prepared.push({
          filename: file.filename,
          contentType: file.contentType || "application/octet-stream",
          contentBase64,
          ...baseMeta
        });
      }
      continue;
    }

    if (format === "svg" || format === "all") {
      prepared.push({
        filename: file.filename,
        contentType: "image/svg+xml",
        contentBase64: base64FromText(file.content),
        ...baseMeta
      });
    }

    if (format === "png" || format === "all") {
      prepared.push({
        filename: replaceExtension(file.filename, ".png"),
        contentType: "image/png",
        contentBase64: await svgToPngBase64(file.content),
        ...baseMeta
      });
    }

    if (format === "pdf" || format === "all") {
      prepared.push({
        filename: replaceExtension(file.filename, ".pdf"),
        contentType: "application/pdf",
        contentBase64: await svgToPdfBase64(file.content),
        ...baseMeta
      });
    }
  }

  return prepared;
}
