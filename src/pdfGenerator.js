import { PDFDocument } from "pdf-lib";
import fs from "fs";
import { renderMassiveTransactions, renderMassiveOverlays } from "./renderHtml.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

async function getPuppeteerPdf(browser, html, fileName, label = "tx") {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let page;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 60000 });
      const pdfResult = await page.pdf({
        format: "A4",
        printBackground: false,
        timeout: 60000
      });
      await page.close();
      return Buffer.from(pdfResult); // Puppeteer v24 returns Uint8Array
    } catch (err) {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      console.error(`Attempt ${attempt} failed for ${fileName} (${label}): ${err.message}`);
      if (attempt === maxRetries) throw err;
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

export async function generatePDF(browser, bgPdfBytes, customer, fileName, subFolder = "") {
  const cardsArray = Array.from(customer.cards.values());

  // Phase 1: Render all transactions in one Chrome pass
  const massiveTxHtml = renderMassiveTransactions(cardsArray);
  const massiveTxBuffer = await getPuppeteerPdf(browser, massiveTxHtml, fileName, "tx");

  // Phase 2: Extract page boundaries per card using CARD_MARKER text
  const parser = new pdfParse.PDFParse({ data: massiveTxBuffer });
  const parsedTxPdf = await parser.getText();
  const pagesText = parsedTxPdf.pages.map(p => p.text);

  const cardsPageCounts = [];
  let currentCardLength = 0;
  let currentCardIdx = 0;

  for (let i = 0; i < pagesText.length; i++) {
    const pageText = pagesText[i];
    if (!pageText.trim() && i === pagesText.length - 1) continue;
    currentCardLength++;
    if (pageText.includes(`CARD_MARKER_${currentCardIdx}`)) {
      cardsPageCounts.push(currentCardLength);
      currentCardLength = 0;
      currentCardIdx++;
    }
  }

  // Fallback in case of parsing drift
  while (cardsPageCounts.length < cardsArray.length) {
    cardsPageCounts.push(1);
  }

  // Phase 3: Render overlays with known page counts
  const massiveOverlayHtml = renderMassiveOverlays(cardsArray, cardsPageCounts);
  const massiveOverlayBuffer = await getPuppeteerPdf(browser, massiveOverlayHtml, fileName, "overlay");

  // Stitch: bg + transactions + overlays
  const finalPdfDoc = await PDFDocument.create();

  // Load bg fresh per call — sharing one instance across concurrent tasks causes race conditions
  const bgPdfDoc = await PDFDocument.load(bgPdfBytes);
  const embeddedBgRep  = await finalPdfDoc.embedPage(bgPdfDoc.getPage(0));
  const embeddedBgLast = await finalPdfDoc.embedPage(bgPdfDoc.getPage(1));
  const bgDimensions = bgPdfDoc.getPage(0).getSize();

  const totalTxPages = cardsPageCounts.reduce((a, b) => a + b, 0);
  const embeddedTxPages      = await finalPdfDoc.embedPdf(massiveTxBuffer,      Array.from({ length: totalTxPages }, (_, i) => i));
  const embeddedOverlayPages = await finalPdfDoc.embedPdf(massiveOverlayBuffer, Array.from({ length: totalTxPages }, (_, i) => i));

  let globalPageIdx = 0;
  for (let cardIdx = 0; cardIdx < cardsArray.length; cardIdx++) {
    const cardPages = cardsPageCounts[cardIdx];
    for (let i = 0; i < cardPages; i++) {
      const embeddedBg = (i === cardPages - 1) ? embeddedBgLast : embeddedBgRep;
      const newPage = finalPdfDoc.addPage([bgDimensions.width, bgDimensions.height]);

      newPage.drawPage(embeddedBg,                         { x: 0, y: 0, width: bgDimensions.width, height: bgDimensions.height });
      if (globalPageIdx < embeddedTxPages.length)      newPage.drawPage(embeddedTxPages[globalPageIdx],      { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
      if (globalPageIdx < embeddedOverlayPages.length) newPage.drawPage(embeddedOverlayPages[globalPageIdx], { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });

      globalPageIdx++;
    }
  }

  const outputDir = subFolder ? `output/pdf/${subFolder}` : "output/pdf";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // useObjectStreams compresses the cross-reference table for additional savings
  const finalPdfBytes = await finalPdfDoc.save({ useObjectStreams: true });
  await fs.promises.writeFile(`${outputDir}/${fileName}.pdf`, finalPdfBytes);
}