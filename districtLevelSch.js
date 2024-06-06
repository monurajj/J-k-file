const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapper() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto("https://socialwelfarekashmir.jk.gov.in/PRMPCOBC.html");

    const response = await page.evaluate(() => {
        const tableRows = document.querySelectorAll('table tbody tr');
        const data = {};

        tableRows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 4 || cells.length === 3) {
                const key = cells[0].innerText.trim();
                let value = '';

                if (cells.length === 4) {
                    // For rows with a description and multiple details
                    value = Array.from(cells).slice(1).map(cell => cell.innerText.trim()).join(', ');
                } else {
                    // For rows with single details
                    value = cells[1].innerText.trim();
                }

                // Convert new lines to bullet points
                value = value.split('\n').map(line => `• ${line.trim()}`).join('\n');
                data[key] = value;
            } else if (index > 0 && cells.length === 1) {
                // Handle merged cells for multi-row sections (like Value of financial Assistance)
                const previousKey = Object.keys(data).pop();
                data[previousKey] += `\n• ${cells[0].innerText.trim()}`;
            }
        });

        return data;
    });

    console.log(response);
    fs.writeFileSync("districtLevel.json", JSON.stringify(response, null, 2));
    await browser.close();
}

scrapper();
