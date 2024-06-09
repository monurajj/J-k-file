const puppeteer = require('puppeteer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // Import the uuid library

async function scrap() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto("https://socialwelfarekashmir.jk.gov.in/welfareschemes.html");

    const response = await page.evaluate(() => {
        const data = [];

        const tableRows = document.querySelectorAll('table tbody tr');
        let currentSectionHeading = '';
        let currentSchemes = new Set(); // Store unique schemes for each section

        tableRows.forEach(row => {
            const sectionHeadingElement = row.querySelector('b');
            if (sectionHeadingElement) {
                currentSectionHeading = sectionHeadingElement.textContent.trim().replace(/[\n\t\r]/g, '');
                data.push({
                    title: currentSectionHeading,
                    schemes: []
                });
                currentSchemes = new Set(); // Reset currentSchemes for each new section
            } else {
                if (data.length === 0) {
                    // No section heading found yet, skip this row
                    return;
                }
                const schemeElements = row.querySelectorAll('a');
                schemeElements.forEach(schemeElement => {
                    const schemeName = schemeElement.textContent.trim().replace(/[\n\t\r]/g, '');
                    const schemeUrl = schemeElement.href;
                    if (!currentSchemes.has(schemeUrl)) {
                        currentSchemes.add(schemeUrl); // Add scheme URL to the Set
                        data[data.length - 1].schemes.push({
                            id: 'TEMP_ID', // Placeholder ID to be replaced later
                            name: schemeName,
                            url: schemeUrl,
                            details: {}, // Initialize details as an empty object
                            criteria: {} // Initialize criteria as an empty object
                        });
                    } else {
                        // Find the existing scheme with the same URL and merge names
                        data[data.length - 1].schemes.forEach(scheme => {
                            if (scheme.url === schemeUrl) {
                                scheme.name += ', ' + schemeName;
                            }
                        });
                    }
                });
            }
        });

        return { data };
    });

    // Generate and assign UUIDs
    response.data.forEach(section => {
        section.schemes.forEach(scheme => {
            scheme.id = uuidv4();
        });
    });

    // Remove entries with empty schemes list
    const filteredData = response.data.filter(entry => entry.schemes.length > 0);

    // Visit each scheme URL and extract additional details and criteria
    for (const section of filteredData) {
        for (const scheme of section.schemes) {
            try {
                await page.goto(scheme.url, { waitUntil: 'networkidle2' });
                const detailsAndCriteria = await page.evaluate(() => {
                    const detailsData = {};
                    const criteriaData = {};
                    
                    // Extract details
                    const rows = document.querySelectorAll('table tbody tr');
                    rows.forEach(row => {
                        const keyElement = row.querySelector('td b, td span[style*="font-weight: 700"]');
                        const valueElement = row.querySelector('td span:not([style*="font-weight: 700"])');
                        if (keyElement && valueElement) {
                            const key = keyElement.textContent.trim().replace(/[\n\t\r]/g, '');
                            const value = valueElement.textContent.trim().replace(/[\n\t\r]/g, '');
                            if (key === 'Description of the Scheme' || key === 'Procedure' || key === 'Eligibility') {
                                detailsData[key] = value;
                            }
                        } else if (keyElement) {
                            const key = keyElement.textContent.trim().replace(/[\n\t\r]/g, '');
                            const value = row.querySelector('td:nth-child(2)').innerText.trim().replace(/[\n\t\r]/g, '');
                            if (key === 'Description of the Scheme' || key === 'Procedure' || key === 'Eligibility') {
                                detailsData[key] = value;
                            }
                        }
                    });

                    // Extract criteria from the last div with align="center" after a p tag
                    const allDivs = document.querySelectorAll('div[align="center"]');
                    const lastDivIndex = Array.from(allDivs).findIndex(div => {
                        return div.nextElementSibling && div.nextElementSibling.tagName === 'P';
                    }) + 1;
                    const criteriaDiv = allDivs[lastDivIndex];
                    if (criteriaDiv) {
                        const criteriaRows = criteriaDiv.querySelectorAll('table tbody tr');
                        if (criteriaRows.length >= 2) { // Ensure there are at least two rows
                            const criteriaKeys = criteriaRows[0].querySelectorAll('td');
                            const criteriaValues = criteriaRows[1].querySelectorAll('td');
                            criteriaKeys.forEach((keyElement, index) => {
                                const key = keyElement.textContent.trim().replace(/[\n\t\r]/g, '');
                                const value = criteriaValues[index]?.textContent.trim().replace(/[\n\t\r]/g, '') || '';
                                criteriaData[key] = value;
                            });
                        }
                    }

                    return { detailsData, criteriaData };
                });
                scheme.details = detailsAndCriteria.detailsData;
                scheme.criteria = detailsAndCriteria.criteriaData;
            } catch (error) {
                console.error(`Failed to navigate to ${scheme.url}: ${error.message}`);
                scheme.details = { error: 'Failed to load details' };
                scheme.criteria = { error: 'Failed to load criteria' };
            }
        }
    }

    // Function to replace keys
    function replaceKeys(obj) {
        const keyMap = {
            'name': 'scheme_name',
            'criteria': 'eligibility_criteria',
            'Category': 'category',
            'Procedure': 'application_process',
            'Description of the Scheme': 'beneficiary_category'
        };

        const newObj = {};
        for (let key in obj) {
            let newKey = keyMap[key] || key;
            newObj[newKey] = obj[key];

            // If the value is an object, apply the replacement recursively
            if (typeof newObj[newKey] === 'object' && newObj[newKey] !== null) {
                newObj[newKey] = replaceKeys(newObj[newKey]);
            }
        }
        return newObj;
    }

    // Apply key replacements
    const replacedData = filteredData.map(section => {
        return {
            ...section,
            schemes: section.schemes.map(scheme => replaceKeys(scheme))
        };
    });

    console.log(replacedData);
    fs.writeFileSync("j & k.json", JSON.stringify(replacedData, null, 2)); // Write only data to the file
    await browser.close();
}

scrap();
