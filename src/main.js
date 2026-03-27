import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { Console } from "console";
import { PDFDocument } from "pdf-lib";

// Create write streams that append ("a") to the log files
const logStream = fs.createWriteStream("logs.txt", { flags: "a" });
const errorStream = fs.createWriteStream("logs errors.txt", { flags: "a" });
const fileLogger = new Console({ stdout: logStream, stderr: errorStream });

// Override global console.log to print ONLY to the file
console.log = function (...args) {
  fileLogger.log(...args);
};

// Override global console.error to print ONLY to the error file
console.error = function (...args) {
  fileLogger.error(...args);
};
import { parseCSV } from "./parseCsv.js";
import { renderCustomerStatements } from "./renderHtml.js";
import { generatePDF } from "./pdfGenerator.js";
import { measureRowsPerPage } from "./measureRows.js";

async function main() {
  console.log("Initializing browser and shared resources...");
  
  // Launch browser once
  const browser = await puppeteer.launch();

  try {
    // Measure how many rows fit in the transaction area — runs only once!
    const rowsPerPage = await measureRowsPerPage(browser);

    // Load and parse the background PDF template into a PDFDocument ONLY ONCE
    const bgPdfBytes = fs.readFileSync("images/VISAL_NewLogo_1.pdf");
    const parsedBgPdfDoc = await PDFDocument.load(bgPdfBytes);

    const dataDir = "data";
    const files = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith(".csv"));

    if (files.length === 0) {
      console.log(`No CSV files found in ${dataDir} folder.`);
    }

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      console.log(`\n--- Processing file: ${file} ---`);

      // Determine the subfolder based on the filename
      let subFolder = "";
      if (file.includes("Credit_Master")) {
        subFolder = "Master";
      } else if (file.includes("Credit_VISA")) {
        subFolder = "VISA";
      }
      
      const customers = await parseCSV(filePath);
      const customerEntries = Array.from(customers.entries());
      const batchSize = 8;
      
      console.log(`Starting generation for ${customerEntries.length} customers in batches of ${batchSize}...`);
      
      for (let i = 0; i < customerEntries.length; i += batchSize) {
        const batch = customerEntries.slice(i, i + batchSize);
        
        // Process the batch concurrently
        await Promise.all(
          batch.map(async ([cif, customer]) => {
            try {
              const { html, pageTypes } = renderCustomerStatements(customer, rowsPerPage);
              const brNo = customer.cards.values().next().value.header.Br_No;
              const fileName = `${brNo}${cif}`;
              
              await generatePDF(browser, parsedBgPdfDoc, html, fileName, pageTypes, subFolder);
              console.log("Generated:", fileName);
            } catch (err) {
              console.error(`Error generating PDF for ${cif} in ${file}:`, err);
            }
          })
        );
      }

      console.log(`Deleted processed file: ${file}`);
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Critical error in main process:", err);
  } finally {
    console.log("\nFinished processing all files. Closing browser...");
    await browser.close();
  }
}

main();