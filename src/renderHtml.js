import fs from "fs";

// ------------------------------------------------------------------
// PAGE MARGIN CONSTANTS — edit these to change the transaction area
// ------------------------------------------------------------------
export const MARGIN_TOP_MM    = 92.6;
export const MARGIN_BOTTOM_MM = 99;

// ------------------------------------------------------------------
// CACHING DISK READS LOCALLY SO THEY DON'T TRIGGER PER-CUSTOMER
// ------------------------------------------------------------------
const defaultCss = fs.readFileSync("Stylesheets/default.css", "utf8");
const defaultTableCss = fs.readFileSync("Stylesheets/default_table_styles.css", "utf8");
const contextCss = fs.readFileSync("Stylesheets/context_all_styles.css", "utf8");

const repPage = fs.readFileSync("Master pages/repPage.html", "utf8");
const lastPage = fs.readFileSync("Master pages/lastPage.html", "utf8");

// Parse section.html: extract the row template from the <tr> inside <tbody>,
// and build the table shell with a {{rows}} placeholder.
const sectionRaw = fs.readFileSync("Context/section.html", "utf8");
const trMatch = sectionRaw.match(/<tr[\s\S]*?<\/tr>/i);
const rowTemplate = trMatch ? trMatch[0] : "";
const tableTemplate = sectionRaw.replace(/<tbody>[\s\S]*?<\/tbody>/i, "<tbody>{{rows}}</tbody>");

function replaceVars(template, data) {
  let html = template;

  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, data[key] ?? "");
  }

  return html;
}

export function renderCustomerStatements(customer, rowsPerPage = 33) {

  const pageTypes = [];
  const allContainers = [];

  for (const [cardNo, card] of customer.cards) {
    const header = card.header;
    const transactions = card.transactions;

    // Chunking logic: rows per page is measured at startup based on actual CSS row height
    const chunkSize = rowsPerPage;
    const chunks = [];
    for (let i = 0; i < transactions.length; i += chunkSize) {
      chunks.push(transactions.slice(i, i + chunkSize));
    }
    
    if (chunks.length === 0) {
      chunks.push([]); // Always generate at least one page
    }

    const totalPages = chunks.length;

    chunks.forEach((chunk, index) => {
      const currentPage = index + 1;
      const isLastPage = currentPage === totalPages;
      
      // Track the type of page so pdfGenerator knows which background to use
      pageTypes.push(isLastPage ? 'last' : 'rep');

      const rows = chunk
        .map(t => replaceVars(rowTemplate, t))
        .join("\n");

      const transactionTable = `
    <div style="margin-top: ${MARGIN_TOP_MM}mm; margin-bottom: ${MARGIN_BOTTOM_MM}mm; padding: 0 12mm;">
      ${tableTemplate.replace("{{rows}}", rows)}
    </div>
      `;

      let pageTemplate = isLastPage ? lastPage : repPage;
      let pageContent = replaceVars(pageTemplate, header);
      
      // Inject pagination (using precise replace targeting {#} and {##})
      pageContent = pageContent.replace(/{#}/g, currentPage);
      pageContent = pageContent.replace(/{##}/g, totalPages);
      
      // Append table (transactions for the chunk)
      pageContent += transactionTable;

      allContainers.push(pageContent);
    });
  }

  // Build the final HTML with page breaks
  const pagesHtml = allContainers.map((content, idx) => {
    const isAbsoluteLast = idx === allContainers.length - 1;
    // ensure no blank trailing page occurs by only adding page-break-after to all but the final element
    const pageBreak = isAbsoluteLast ? "" : ' style="page-break-after: always;"';
    return `\n<div class="page-container"${pageBreak}>\n${content}\n</div>\n`;
  }).join("");

  const finalHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultCss}
    ${defaultTableCss}
    ${contextCss}
    
    @page {
      margin: 0;
      size: A4;
    }
    
    body {
      margin: 0;
      padding: 0;
      background-color: transparent;
    }

    .page-container {
      position: relative;
      width: 210mm;
      height: 297mm; /* A4 size strictly */
      box-sizing: border-box;
      overflow: hidden;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>
  `;

  return { html: finalHtml, pageTypes };
}