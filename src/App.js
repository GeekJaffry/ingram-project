import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';

const App = () => {
  const [ocProductData, setOcProductData] = useState([]);
  const [ingramData, setIngramData] = useState([]);
  const [ocProductDescData, setOcProductDescData] = useState([]);
  const [result, setResult] = useState([]);

  // Helper function to load a CSV file via PapaParse
  const loadCSV = (filePath, setData) => {
    //console.log(`Loading CSV from: ${filePath}`);
    Papa.parse(filePath, {
      download: true,
      header: true,
      complete: (results) => {
        //console.log(`Parsed results for ${filePath}:`, results);
        setData(results.data);
      },
      error: (err) => {
        console.error(`Error loading CSV file ${filePath}:`, err);
      }
    });
  };

  // Load the CSV files on component mount
  useEffect(() => {
    //console.log('Loading CSV files...');
    loadCSV('/oc_product.csv', (data) => {
      setOcProductData(data);
    });
    loadCSV('/ingram_micro.csv', (data) => {
      setIngramData(data);
    });
    loadCSV('/oc_product_description.csv', (data) => {
      setOcProductDescData(data);
    });
  }, []);

  // Process data once all CSVs are loaded
  useEffect(() => {
    if (ocProductData.length && ingramData.length && ocProductDescData.length) {
      const resultsArray = [];
      ocProductData.forEach((ocProduct) => {
        const { model, product_id, quantity } = ocProduct;

        // Search ingram_micro for a matching model in the Product column
        const ingramMatch = ingramData.find(item => item.Product && item.Product.includes(model));
        if (!ingramMatch) return; // Skip if no matching model found
        
        // From ingram_micro, use the "Product" field to extract storage (if present) and grade.
        const ingramName = ingramMatch.Product;

        // Regex to extract storage: looks for patterns like "32GB" or "2TB"
        const storageMatch = ingramName.match(/(\d+\s*(GB|TB))/i);
        const storage = storageMatch ? storageMatch[0].replace(/\s+/g, '') : null; // e.g. "32GB"

        // Check for the special case of "Pristine A+ Open Box" in Grade column
        let grade = null;
        if (ingramMatch.Grade === 'Pristine A+ Open Box') {
          // For this case, we'll look for [Open Box] in product description
          const descMatch = ocProductDescData.find(item => item.product_id === product_id);
          if (descMatch) {
            const productDescName = descMatch.name;
            const hasOpenBox = productDescName.includes('[Open Box]');
            if (hasOpenBox) {
              grade = 'Open Box';
            }
          }
        } else {
          // Regular grade matching logic
          const gradeMatch = ingramName.match(/Grade\s*([A-C])/i);
          grade = gradeMatch ? `Grade ${gradeMatch[1].toUpperCase()}` : null;
        }

        // Look up the product description using product_id
        const descMatch = ocProductDescData.find(item => item.product_id === product_id);
        if (!descMatch) return; // Skip if product description not found

        const productDescName = descMatch.name;

        // Check matching logic:
        // For special case of "Pristine A+ Open Box", we only need storage to match
        const storageMatches = !storage || productDescName.toLowerCase().includes(storage.toLowerCase());
        const gradeMatches = ingramMatch.Grade === 'Pristine A+ Open Box' ? 
          productDescName.includes('[Open Box]') : 
          (!grade || productDescName.toLowerCase().includes(grade.toLowerCase()));

        if (storageMatches && gradeMatches) {
          // Construct the result string with both product descriptions
          const displayStorage = storage || 'No storage info';
          const displayGrade = grade || 'No grade info';
          const displayString = `${ingramMatch.Product} \nModel: ${model} | ${displayStorage} ${displayGrade} (Quantity ${quantity})`;
          resultsArray.push(displayString);
        }
      });

      setResult(resultsArray);
    }
  }, [ocProductData, ingramData, ocProductDescData]);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Product Matches</h1>
      {result.length > 0 ? (
        result.map((item, index) => (
          <div key={index} style={{ margin: '10px 0' }}>
            {item}
          </div>
        ))
      ) : (
        <p>No matching products found.</p>
      )}
    </div>
  );
};

export default App;
