import { PDFDocument } from "pdf-lib";
import fs from "fs";

export async function generatePDF(browser, bgPdfDoc, html, fileName, pageTypes = [], subFolder = "") {
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
      break; // Success! Exit the retry loop.
    } catch (err) {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      console.error(`Attempt ${attempt} failed for ${fileName}: ${err.message}`);
      if (attempt === maxRetries) throw err; // Throw on final failure
      await new Promise(res => setTimeout(res, 2000)); // Wait before retry
    }
  }
  
  // Create a new final document
  const finalPdfDoc = await PDFDocument.create();
  
  // Load the generated PDF just to get the page count
  const generatedPdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = generatedPdfDoc.getPageCount();

  // Embed the pages of the generated PDF into the final document
  const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
  const embeddedPages = await finalPdfDoc.embedPdf(pdfBuffer, pageIndices);

  // Only embed the background page XObjects that are actually used in this document
  const needsRep  = pageTypes.some(t => t !== 'last');
  const needsLast = pageTypes.some(t => t === 'last');

  const sourceBgRep  = bgPdfDoc.getPage(0);
  const sourceBgLast = bgPdfDoc.getPage(1);
  const bgDimensions = sourceBgRep.getSize();

  const embeddedBgRep  = needsRep  ? await finalPdfDoc.embedPage(sourceBgRep)  : null;
  const embeddedBgLast = needsLast ? await finalPdfDoc.embedPage(sourceBgLast) : null;

  for (let i = 0; i < pageCount; i++) {
    const type = pageTypes[i] || (i === pageCount - 1 ? 'last' : 'rep');
    const embeddedBg = type === 'last' ? embeddedBgLast : embeddedBgRep;
    
    const newPage = finalPdfDoc.addPage([bgDimensions.width, bgDimensions.height]);

    newPage.drawPage(embeddedBg, {
      x: 0,
      y: 0,
      width: bgDimensions.width,
      height: bgDimensions.height
    });

    const embeddedHtmlPage = embeddedPages[i];

    newPage.drawPage(embeddedHtmlPage, {
      x: 0,
      y: 0,
      width: newPage.getWidth(),
      height: newPage.getHeight()
    });
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