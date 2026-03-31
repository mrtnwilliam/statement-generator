import { PDFDocument } from "pdf-lib";
import fs from "fs";
import { renderCardTransactions, renderCardOverlays } from "./renderHtml.js";

async function getPuppeteerPdf(browser, html, fileName, isOverlay = false) {
  let pdfBuffer = null;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let page;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 60000 });
      pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true, 
        omitBackground: true,  
        timeout: 60000
      });
      await page.close();
      return pdfBuffer;
    } catch (err) {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      console.error(`Attempt ${attempt} failed for ${fileName} (${isOverlay ? 'overlay' : 'tx'}): ${err.message}`);
      if (attempt === maxRetries) throw err;
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

export async function generatePDF(browser, bgPdfDoc, customer, fileName, subFolder = "") {
  // Create a new master document to hold all cards for this customer
  const finalPdfDoc = await PDFDocument.create();

  // Load the background XObjects once for this document
  const sourceBgRep  = bgPdfDoc.getPage(0);
  const sourceBgLast = bgPdfDoc.getPage(1);
  const embeddedBgRep  = await finalPdfDoc.embedPage(sourceBgRep);
  const embeddedBgLast = await finalPdfDoc.embedPage(sourceBgLast);
  const bgDimensions = sourceBgRep.getSize();

  // Loop through all cards belonging to this customer
  for (const [cardNo, card] of customer.cards) {
    
    // 1. Render transaction HTML natively
    const txHtml = renderCardTransactions(card);
    const txBuffer = await getPuppeteerPdf(browser, txHtml, fileName, false);
    
    // Parse the generated transaction PDF just to discover Chrome's page count
    const txPdfDoc = await PDFDocument.load(txBuffer);
    const pageCount = txPdfDoc.getPageCount();

    // 2. Render overlays HTML optimally formatted for the discovered pageCount
    const overlayHtml = renderCardOverlays(card, pageCount);
    const overlayBuffer = await getPuppeteerPdf(browser, overlayHtml, fileName, true);
    
    // 3. Extract pages as XObjects 
    const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
    const embeddedTxPages = await finalPdfDoc.embedPdf(txBuffer, pageIndices);
    const embeddedOverlayPages = await finalPdfDoc.embedPdf(overlayBuffer, pageIndices);

    // 4. Stamp them all together into the master document
    for (let i = 0; i < pageCount; i++) {
        const isAbsoluteLast = (i === pageCount - 1);
        const embeddedBg = isAbsoluteLast ? embeddedBgLast : embeddedBgRep;
        
        const newPage = finalPdfDoc.addPage([bgDimensions.width, bgDimensions.height]);

        // Stamp 1: Background Template (repPage or lastPage image)
        newPage.drawPage(embeddedBg, {
          x: 0,
          y: 0,
          width: bgDimensions.width,
          height: bgDimensions.height
        });

        // Stamp 2: Transactions (Text layout from Chrome)
        newPage.drawPage(embeddedTxPages[i], {
          x: 0,
          y: 0,
          width: newPage.getWidth(),
          height: newPage.getHeight()
        });

        // Stamp 3: Overlays (Absolute HTML Template Overlays)
        newPage.drawPage(embeddedOverlayPages[i], {
          x: 0,
          y: 0,
          width: newPage.getWidth(),
          height: newPage.getHeight()
        });
    }
  }

  // Ensure output directory exists before writing
  const outputDir = subFolder ? `output/pdf/${subFolder}` : "output/pdf";
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write final PDF to disk
  const finalPdfBytes = await finalPdfDoc.save();
  await fs.promises.writeFile(`${outputDir}/${fileName}.pdf`, finalPdfBytes);
}