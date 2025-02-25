//logic working but not multiple storage

import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Helper functions
const extractGrade = (name) => {
  if (!name) return null;
  const gradeMatch = name.match(/\[(.*?)\]/);
  if (!gradeMatch) return null;

  const grade = gradeMatch[1];
  if (grade === 'Brand New') return 'BN';
  if (grade === 'Grade A') return 'GA';
  if (grade === 'Grade B') return 'GB';
  if (grade === 'Open Box') return 'OB';
  if (grade === 'Like New') return 'LN';
  return null;
};

const extractStorage = (name) => {
    if (!name) return null;
  
    // First try to find storage in parentheses (like in OC products)
    const parenthesesMatch = name.match(/\((\d+(?:GB|TB)?(?:\s+\d+(?:GB|TB)?)?)\)/i);
    if (parenthesesMatch) {
      const storageStr = parenthesesMatch[1];
      
      // Check if it contains multiple storage values with space
      if (storageStr.includes(' ')) {
        // Split storage values, but only if they contain space
        const storageValues = storageStr.split(' ')
          .map(s => {
            // Remove GB for non-TB values, keep TB as-is
            const cleanedValue = s.replace(/GB/i, '');
            return parseInt(cleanedValue);
          })
          .filter(n => !isNaN(n));
        
        // For multiple storage, return array of sizes with original string
        return {
          sizes: storageValues,
          unit: 'GB', // Multiple storage is always GB
          isMultiple: true,
          originalMultiStorage: storageStr
        };
      } else {
        // Single storage value
        const size = parseInt(storageStr.replace(/GB|TB/i, ''));
        // For TB, we need exact match with unit
        if (storageStr.toUpperCase().includes('TB')) {
          return { size, unit: 'TB', isMultiple: false };
        }
        return { size, unit: 'GB', isMultiple: false };
      }
    }
  
    // For Ingram products, extract all storage numbers
    const numbers = [];
    const words = name.split(/\s+/);
    
    // First check for TB as it must be exact
    const tbMatch = name.match(/(\d+)\s*TB/i);
    if (tbMatch) {
      return { size: parseInt(tbMatch[1]), unit: 'TB', isMultiple: false };
    }
  
    // Then look for all potential GB storage numbers
    for (const word of words) {
      if (/^\d+$/.test(word)) {
        const size = parseInt(word);
        // Common storage sizes to avoid false positives
        if ([32, 64, 128, 256, 512, 1024].includes(size)) {
          numbers.push(size);
        }
      }
    }
  
    if (numbers.length > 0) {
      return {
        sizes: numbers,
        unit: 'GB',
        isMultiple: numbers.length > 1
      };
    }
  
    return null;
  };

const getBaseProductName = (name) => {
  if (!name) return '';
  return name
    .replace(/\s*\[[^\]]*\]\s*/, '') // Remove grade in brackets
    .replace(/\s*\(\d+(?:GB)?\)\s*/i, '') // Remove storage in parentheses
    .replace(/\s*\([A-Z0-9,]+\)\s*/i, '') // Remove model numbers in parentheses
    .trim();
};

const cleanIngramProduct = (product) => {
  if (!product) return '';
  const parts = product.split(' -');
  return parts[0].trim();
};

const processModelMatches = (ocProducts, ingramProducts) => {
  const results = [];
  const modelMatches = new Map(); // model -> { storage -> products }

  // First collect all valid models from OC products
  ocProducts.forEach(ocProduct => {
    // Skip if model has spaces or is too short
    if (!ocProduct.Model || 
        ocProduct.Model.length <= 3 || 
        String(ocProduct.Model).includes(' ')) {
      return;
    }

    if (!modelMatches.has(ocProduct.Model)) {
      modelMatches.set(ocProduct.Model, new Map()); // storage -> products map
    }
    
    // Get storage info
    const storage = extractStorage(ocProduct.Name);
    // Create a single storage key that includes all storage values if multiple
    const storageKey = storage 
      ? (storage.isMultiple 
          ? storage.sizes.join(',')  // Multiple storage values joined with comma
          : (storage.unit === 'TB' ? `${storage.size}${storage.unit}` : `${storage.size}`))
      : 'NO_STORAGE';
    
    if (!modelMatches.get(ocProduct.Model).has(storageKey)) {
      modelMatches.get(ocProduct.Model).set(storageKey, {
        products: [],
        ingramIndices: new Set()
      });
    }
    
    modelMatches.get(ocProduct.Model).get(storageKey).products.push(ocProduct);
  });

  // Process each Ingram product
  ingramProducts.forEach((ingramProduct, index) => {
    const cleanedProduct = cleanIngramProduct(ingramProduct.Product);
    const ingramStorage = extractStorage(ingramProduct.Product);
    const firstWord = cleanedProduct.split(' ')[0];
    
    // Check each model if it exists in this Ingram product
    modelMatches.forEach((storageMap, model) => {
      // Skip this model if it matches the first word
      if (model === firstWord) {
        return;
      }
      
      // Continue with matching if model exists in the product name
      if (cleanedProduct.includes(model)) {
        console.log('Model Found:', storageMap);
        storageMap.forEach((data, storageKey) => {
          let storageMatches = false;

          console.log('Matching Product Details:', {
            ocProductModel: model,
            storageKey: storageKey,
            ingramProductName: cleanedProduct,
            ingramStorage: ingramStorage
          });

          // Targeted logging for A2337 model
          if (model === 'A2337') {
            console.log('A2337 Matching Details:', {
              storageKey: storageKey,
              cleanedProduct: cleanedProduct,
              ingramStorage: ingramStorage
            });
          }
          
          // Handle special case for multi-storage with space in parentheses
        if (ingramStorage && ingramStorage.originalMultiStorage && ingramStorage.originalMultiStorage.includes(' ')) {
            // Ensure ALL sizes are present in the Ingram product
            storageMatches = ingramStorage.sizes.every(size => {
              // Check if the size is present in the Ingram product name
              const sizeInName = cleanedProduct.includes(size.toString());
              
              // Detailed logging
              console.log(`Matching multi-storage size ${size} for ${model}:`, {
                sizeInName: sizeInName,
                cleanedProduct: cleanedProduct
              });
              
              return sizeInName;
            });
        }
          // Existing storage matching logic for other cases
          else if (storageKey === 'NO_STORAGE') {
            storageMatches = true;
          } else if (ingramStorage) {
            // Handle comma-separated storage values
            if (storageKey.includes(',')) {
                console.log('test')
                if (model === 'A2337') {
                    console.log('A2337 test Matching Details:', {
                      storageKey: storageKey,
                      cleanedProduct: cleanedProduct,
                      ingramStorage: ingramStorage
                    });
                  }
              const requiredSizes = storageKey.split(',').map(size => parseInt(size.trim()));
              const ingramSizes = Array.isArray(ingramStorage.sizes) ? ingramStorage.sizes : [ingramStorage.size];
              
              storageMatches = requiredSizes.every(size => {
                const sizeInStorage = ingramSizes.includes(size);
                const sizeInName = cleanedProduct.includes(size.toString());
                
                return sizeInStorage && sizeInName;
              });
            }
            // Existing single storage value handling
            else if (Array.isArray(ingramStorage.sizes)) {
              storageMatches = ingramStorage.sizes.includes(parseInt(storageKey));
            }
            else if (ingramStorage.size !== undefined && ingramStorage.unit) {
              storageMatches = 
                (ingramStorage.unit === 'TB' && storageKey === `${ingramStorage.size}${ingramStorage.unit}`) ||
                (ingramStorage.unit === 'GB' && ingramStorage.size !== undefined && storageKey === ingramStorage.size.toString());
            } else {
              storageMatches = false;
              console.log('test2',model)
            }
          } else {
            storageMatches = false;
          }

          if (model === 'A2337') {
            console.log('A2337 Final Storage Match Result:', storageMatches);
          }

          if (storageMatches) {
            data.ingramIndices.add(index);
          }
        });
      }
    });
  });

  // Process matches and create results
  modelMatches.forEach((storageMap, model) => {
    storageMap.forEach((data, storageKey) => {
      if (data.ingramIndices.size === 0) return;

      // Calculate grade totals
      const gradeCounts = { BN: 0, GB: 0, GA: 0, OB: 0, LN: 0 };
      let totalQuantity = 0;

      data.products.forEach(product => {
        const grade = extractGrade(product.Name);
        if (grade) {
          const quantity = parseInt(product.Qty) || 0;
          gradeCounts[grade] += quantity;
          totalQuantity += quantity;
        }
      });

      // Get base product name from first product
      const baseName = getBaseProductName(data.products[0].Name);
      const storage = extractStorage(data.products[0].Name);
      const storageStr = storage ? ` (${storage.size}${storage.unit})` : '';

      // Get matching Ingram products
      const matchingIngramProducts = Array.from(data.ingramIndices).map(index => ({
        original: ingramProducts[index].Product,
        cleaned: cleanIngramProduct(ingramProducts[index].Product)
      }));

      // Create result entry
      results.push({
        model,
        productName: `${baseName}${storageStr} (${model})`,
        totalQuantity,
        matchType: 'model',
        storage: storage ? `${storage.size}${storage.unit}` : 'N/A',
        gradeCounts: `BN:${gradeCounts.BN},GA:${gradeCounts.GA},GB:${gradeCounts.GB},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`,
        matchingProducts: [
          'OC Products:',
          ...data.products.map(p => p.Name),
          '',
          'Matching Ingram Products:',
          ...matchingIngramProducts.map(p => p.original)
        ].join('\n'),
        ingramIndices: Array.from(data.ingramIndices)
      });
    });
  });

  return results;
};

const LogicComponent = () => {
  const [ocProductData, setOcProductData] = useState([]);
  const [ingramData, setIngramData] = useState([]);
  const [result, setResult] = useState([]);
  const [error, setError] = useState('');

  const handleFileUpload = (file, type) => {
    if (!file) return;

    if (type === 'ocProduct') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          setOcProductData(jsonData);
          setError('');
        } catch (error) {
          console.error('Error processing XLSX:', error);
          setError('Error processing OC Products file');
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (type === 'ingramMicro') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const result = Papa.parse(text, { header: true });
          setIngramData(result.data);
          setError('');
        } catch (error) {
          console.error('Error processing CSV:', error);
          setError('Error processing Ingram Micro file');
        }
      };
      reader.readAsText(file);
    }
  };

  const processData = () => {
    if (!ocProductData.length || !ingramData.length) {
      setError('Please upload both files first');
      return;
    }

    try {
      const results = processModelMatches(ocProductData, ingramData);
      setResult(results);
      setError('');
    } catch (error) {
      console.error('Error processing data:', error);
      setError('Error processing data');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>New Logic Product Matcher</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Upload Files</h3>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label>OC Products (XLSX):</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFileUpload(e.target.files[0], 'ocProduct')}
              style={{ display: 'block', marginTop: '5px' }}
            />
          </div>
          <div>
            <label>Ingram Micro (CSV):</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileUpload(e.target.files[0], 'ingramMicro')}
              style={{ display: 'block', marginTop: '5px' }}
            />
          </div>
        </div>
        
        <button 
          onClick={processData}
          disabled={!ocProductData.length || !ingramData.length}
          style={{ 
            padding: '10px 20px',
            backgroundColor: (!ocProductData.length || !ingramData.length) ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!ocProductData.length || !ingramData.length) ? 'not-allowed' : 'pointer'
          }}
        >
          Process Files
        </button>
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {result.length > 0 && (
        <div>
          <h3>Results</h3>
          <div style={{ marginTop: '20px' }}>
            {result.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd' }}>
                <div><strong>Product:</strong> {item.productName}</div>
                <div><strong>Storage:</strong> {item.storage}</div>
                <div><strong>Match Type:</strong> {item.matchType}</div>
                <div><strong>Total Quantity:</strong> {item.totalQuantity}</div>
                <div><strong>Grade Counts:</strong> {item.gradeCounts}</div>
                <div><strong>Matching Products:</strong></div>
                <pre style={{ marginTop: '5px', whiteSpace: 'pre-wrap' }}>
                  {item.matchingProducts}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LogicComponent;