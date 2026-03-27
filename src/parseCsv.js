import fs from "fs";
import csv from "csv-parser";

// Optional: if you want to compute CIF from accNum
// function extractCIF(accNum) {
//   return accNum.substring(4, 11); // 5th digit + next 7 digits
// }

export function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const customers = new Map(); // Use Map instead of plain object

    fs.createReadStream(filePath)
      .pipe(csv({ separator: "|" }))
      .on("data", (row) => {
        // const cif = extractCIF(row.accNum);
        const cif = row.CIF; 
        const cardNo = row.CardNo;

        // Create customer if it doesn't exist
        if (!customers.has(cif)) {
          customers.set(cif, {
            cards: new Map() // cards also as a Map
          });
        }

        const customer = customers.get(cif);

        // Create card if it doesn't exist
        if (!customer.cards.has(cardNo)) {
          customer.cards.set(cardNo, {
            header: {
              accNum: row.accNum,
              Br_No: row.accNum.substring(0, 2),
              CardNo: row.CardNo,
              CardNoMsk: row.CardNoMsk,
              CardType: row.CardType,
              Branch: row.Branch,
              name: row.name,
              Add1: row.Add1,
              Add2: row.Add2,
              Add3: row.Add3,
              Add4: row.Add4,
              Add5: row.Add5,
              StatDate: row.StatDate,
              CrLimit: row.CrLimit,
              OpenBal: row.OpenBal,
              CloseBal: row.CloseBal,
              PrevBal: row.PrevBal,
              TotDebit: row.TotDebit,
              Balance: row.Balance,
              MinPay: row.MinPay,
              DueDate: row.DueDate,
              Earned: row.Earned,
              Redeemed: row.Redeemed
            },
            transactions: []
          });
        }

        // Add transaction to the card
        customer.cards.get(cardNo).transactions.push({
          TDate: row.TDate,
          VDate: row.VDate,
          Reference: row.Reference,
          transaction: row.transaction,
          Amount: row.Amount
        });
      })
      .on("end", () => resolve(customers))
      .on("error", reject);
  });
}