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
  if (!name || typeof name !== 'string') return null;

  // Check for storage in parentheses with space (multiple storage)
  const multiStorageMatch = name.match(/\((\d+(?:GB|TB)?\s+\d+(?:GB|TB)?)\)/i);
  if (multiStorageMatch) {
    const storageStr = multiStorageMatch[1];
    const sizes = storageStr.split(/\s+/)
      .map(s => {
        const match = s.match(/(\d+)(?:GB|TB)?/i);
        return match ? parseInt(match[1]) : null;
      })
      .filter(s => s !== null);
    
    return {
      sizes,
      isMultiple: true,
      originalMultiStorage: multiStorageMatch[1]
    };
  }

  // Single storage in parentheses or without
  const storageMatch = name.match(/(?:\()?(\d+)\s*(GB|TB)(?:\))?/i);
  if (storageMatch) {
    return {
      size: parseInt(storageMatch[1]),
      unit: storageMatch[2].toUpperCase(),
      isMultiple: false
    };
  }

  return null;
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== 'string') return { normalized: '', storage: null };
  
  // Extract storage before normalization
  const storage = extractStorage(name);
  
  let cleaned = name;
  
  // Only remove text between " -" and parenthesis if both patterns exist
  if (cleaned.includes(' -') && cleaned.includes('(')) {
    const dashIndex = cleaned.indexOf(' -');
    const parenIndex = cleaned.indexOf('(', dashIndex);
    if (parenIndex > dashIndex) {
      cleaned = cleaned.substring(0, dashIndex) + ' ' + cleaned.substring(parenIndex);
    }
  }
  
  cleaned = cleaned
    .replace(/5G\s+/g, '') // Remove 5G with trailing space
    .replace(/\[[^\]]*\]/g, '') // Remove grade in square brackets
    .replace(/\((\d+)\s*GB\)/gi, '$1') // Keep numbers, remove (GB) from parentheses
    .replace(/(\d+)\s*GB/gi, '$1') // Keep numbers, remove GB without parentheses
    .replace(/\((\d+)\s*TB\)/gi, '$1TB') // Keep numbers with TB unit
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim(); // Remove leading/trailing spaces

  return {
    normalized: cleaned,
    storage
  };
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

const getNameVariations = (normalizedName) => {
  const variations = [normalizedName];
  
  // If name contains "Plus", add version with "+"
  if (normalizedName.includes(' Plus')) {
    variations.push(normalizedName.replace(' Plus', '+'));
  }
  // If name contains "+", add version with "Plus"
  else if (normalizedName.includes('+')) {
    variations.push(normalizedName.replace('+', ' Plus'));
  }

  // Handle SE 3rd Gen variation
  if (normalizedName.includes(' SE ')) {
    const seMatch = normalizedName.match(/SE (\d)(?:rd|th|st|nd) Gen/i);
    if (seMatch) {
      const seNumber = seMatch[1];
      const seVariation = normalizedName.replace(/SE \d(?:rd|th|st|nd) Gen/i, `SE${seNumber}`);
      variations.push(seVariation);
    }
  }

  // Handle Pixel Pro variation (only for Pixel products)
  if (normalizedName.includes(' Pixel ')) {
    const pixelMatch = normalizedName.match(/Pixel (\d+) Pro/i);
    if (pixelMatch) {
      const pixelNumber = pixelMatch[1];
      const pixelVariation = normalizedName.replace(`Pixel ${pixelNumber} Pro`, `Pixel ${pixelNumber}Pro`);
      variations.push(pixelVariation);
    }
  }
  
  return variations;
};

const processModelMatches = (ocProducts, ingramData) => {
  const results = [];
  const modelMatches = new Map(); // model -> { storage -> products }
  const nameMatches = new Map();
  const processedIngramIndices = new Set();

  // First organize OC products by normalized name
  const normalizedOcProducts = new Map(); // normalized name -> product info

  ocProducts.forEach(ocProduct => {
    if (!ocProduct.Name) return;
    
    const { normalized: normalizedName, storage } = normalizeProductName(ocProduct.Name);
    const grade = extractGrade(ocProduct.Name);
    const quantity = parseInt(ocProduct.Qty) || 0;

    if (!normalizedOcProducts.has(normalizedName)) {
      normalizedOcProducts.set(normalizedName, {
        name: normalizedName,
        storage: storage,
        grades: [],
        quantities: { BN: 0, GB: 0, GA: 0, OB: 0, LN: 0 },
        originalProducts: []
      });
    }

    const productInfo = normalizedOcProducts.get(normalizedName);
    if (grade) {
      productInfo.grades.push(grade);
      productInfo.quantities[grade] += quantity;
    }
    productInfo.originalProducts.push(ocProduct);
  });

  // First collect all valid models from OC products
  ocProducts.forEach(ocProduct => {
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
    const storageKey = storage 
      ? (storage.isMultiple 
          ? storage.sizes.join(',')
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
  ingramData.forEach((ingramProduct, index) => {
    const cleanedProduct = cleanIngramProduct(ingramProduct.Product);
    const ingramStorage = extractStorage(ingramProduct.Product);
    const firstWord = cleanedProduct.split(' ')[0];
    
    modelMatches.forEach((storageMap, model) => {
      if (model === firstWord) return;
      // Check if model exists in product name, handling /DS suffix for Samsung models
      //COMMENT OUT BECAUSE NEED APPROVAL
      const modelStr = String(model);
      let modelExists;

      if (/^samsung\s+/i.test(cleanedProduct)) {
        // Strict matching for Samsung products
        const hasDsOrDsn = modelStr.endsWith('/DS') || modelStr.endsWith('/DSN');
        const ingramModelMatch = cleanedProduct.match(/SM-[A-Z0-9]+(?:\/(?:DS|DSN))?/);
        const ingramModelStr = ingramModelMatch ? ingramModelMatch[0] : '';
        const ingramHasDsOrDsn = ingramModelStr.endsWith('/DS') || ingramModelStr.endsWith('/DSN');
        
        // Only match if both have or both don't have DS/DSN suffix
        modelExists = (hasDsOrDsn === ingramHasDsOrDsn) && 
          (modelStr === ingramModelStr || 
           (hasDsOrDsn && modelStr.replace(/\/DSN?$/, '') === ingramModelStr.replace(/\/DSN?$/, '')));
      } else {
        // Original matching logic for non-Samsung products
        modelExists = cleanedProduct.includes(modelStr);
      }
      
      if (modelExists) {
        storageMap.forEach((data, storageKey) => {
          let storageMatches = false;

          if (ingramStorage && ingramStorage.originalMultiStorage && ingramStorage.originalMultiStorage.includes(' ')) {
            storageMatches = ingramStorage.sizes.every(size => {
              return cleanedProduct.includes(size.toString());
            });
          }
          else if (storageKey === 'NO_STORAGE') {
            storageMatches = true;
          } else if (ingramStorage || storageKey) {
            if (storageKey.includes(',')) {
              const requiredSizes = storageKey.split(',').map(size => parseInt(size.trim()));
              storageMatches = requiredSizes.every(size => {
                const sizeInName = cleanedProduct.includes(size.toString());
                return sizeInName;
              });
            }
            else if (ingramStorage && Array.isArray(ingramStorage.sizes)) {
              storageMatches = ingramStorage.sizes.includes(parseInt(storageKey));
            }
            else if (ingramStorage && ingramStorage.size !== undefined && ingramStorage.unit) {
              storageMatches = 
                (ingramStorage.unit === 'TB' && storageKey === `${ingramStorage.size}${ingramStorage.unit}`) ||
                (ingramStorage.unit === 'GB' && ingramStorage.size !== undefined && storageKey === ingramStorage.size.toString());
            } else {
              storageMatches = false;
            }
          } else {
            storageMatches = false;
          }

          if (storageMatches) {
            data.ingramIndices.add(index);
          }
        });
      }
    });
  });

  // Process model matches first
  modelMatches.forEach((storageMap, model) => {
    storageMap.forEach((data, storageKey) => {
      if (data.ingramIndices.size === 0) return;

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

      const baseName = getBaseProductName(data.products[0].Name);
      const storage = extractStorage(data.products[0].Name);
      const storageStr = storage ? ` (${storage.size}${storage.unit})` : '';

      const matchingIngramProducts = Array.from(data.ingramIndices).map(index => ({
        original: ingramData[index].Product,
        cleaned: cleanIngramProduct(ingramData[index].Product)
      }));

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

      // Mark these Ingram products as processed
      data.ingramIndices.forEach(idx => processedIngramIndices.add(idx));
    });
  });

  // Now do name matching for unmatched products
  normalizedOcProducts.forEach((productInfo, normalizedName) => {
    ingramData.forEach((ingramProduct, ingramIndex) => {
      if (processedIngramIndices.has(ingramIndex)) return;

      const { normalized: normalizedIngramName, storage: ingramStorage } = normalizeProductName(ingramProduct.Product);
      
      // Get all possible variations of the name and make comparison case-insensitive
      const variations = getNameVariations(normalizedName);
      const normalizedIngramLower = normalizedIngramName.toLowerCase();
      const nameMatch = variations.some(variant => 
        normalizedIngramLower.startsWith(variant.toLowerCase())
      );

      if (nameMatch) {
        const storageMatches = !productInfo.storage || !ingramStorage || 
          (productInfo.storage.isMultiple && productInfo.storage.sizes.every(size => 
            ingramStorage.isMultiple ? ingramStorage.sizes.includes(size) : ingramStorage.size === size
          )) ||
          (!productInfo.storage.isMultiple && !ingramStorage.isMultiple && productInfo.storage.size === ingramStorage.size);

        if (storageMatches) {
          if (!nameMatches.has(normalizedName)) {
            nameMatches.set(normalizedName, {
              productInfo,
              ingramIndices: new Set()
            });
          }
          
          nameMatches.get(normalizedName).ingramIndices.add(ingramIndex);
          processedIngramIndices.add(ingramIndex);
        }
      }
    });
  });

  // Process name matches
  nameMatches.forEach((match, normalizedName) => {
    const productInfo = match.productInfo;
    
    Array.from(match.ingramIndices).forEach(ingramIndex => {
      results.push({
        model: normalizedName,
        productName: ingramData[ingramIndex].Product,
        totalQuantity: Object.values(productInfo.quantities).reduce((sum, qty) => sum + qty, 0),
        matchType: 'name',
        storage: extractStorage(ingramData[ingramIndex].Product)?.size || 'N/A',
        gradeCounts: `BN:${productInfo.quantities.BN},GA:${productInfo.quantities.GA},GB:${productInfo.quantities.GB},OB:${productInfo.quantities.OB},LN:${productInfo.quantities.LN}`,
        matchingProducts: productInfo.originalProducts.map(p => p.Name).join('\n'),
        ingramIndices: [ingramIndex]
      });
    });
  });

  // Fallback matcher for unmatched products
  /*const fallbackMatch = (ocProduct, ingramIndex) => {
    if (processedIngramIndices.has(ingramIndex)) return false;
    
    const ingramProduct = ingramData[ingramIndex].Product.toLowerCase();
    const ocName = ocProduct.Name.toLowerCase();

    // Only match Samsung products
    if (!ocName.startsWith('samsung') || !ingramProduct.startsWith('samsung')) {
      return false;
    }
    
    // Skip accessories
    if (ocName.includes('case') || 
        ocName.includes('cover') || 
        ocName.includes('protector') ||
        ocName.includes('pen') ||
        ocName.includes('stylus')) return false;

    // Get storage from both products
    const ocStorage = extractStorage(ocName);
    const ingramStorage = extractStorage(ingramProduct);
    
    // If either product doesn't have storage info, they can't match
    if (!ocStorage || !ingramStorage) return false;

    // Basic matching - both storage and some common words should match
    let storageMatches = false;
    
    if (ocStorage.isMultiple && ingramStorage.isMultiple) {
      // Both have multiple storage values
      storageMatches = ocStorage.sizes.every(size => 
        ingramStorage.sizes.includes(size)
      );
    } else if (!ocStorage.isMultiple && !ingramStorage.isMultiple) {
      // Both have single storage value
      storageMatches = ocStorage.size === ingramStorage.size;
    }
    // If one has multiple and other has single, they don't match
    
    // Get normalized words for matching
    const ocWords = cleanIngramProduct(ocName).split(' ');
    const ingramWords = cleanIngramProduct(ingramProduct).split(' ');
    
    // At least 2 significant words should match (excluding common words)
    const commonWords = ocWords.filter(word => 
      ingramWords.includes(word) && 
      word.length > 2 && 
      !['the', 'and', 'for', 'with'].includes(word)
    );

    return storageMatches && commonWords.length >= 2;
  };*/

  // Try fallback matching for unmatched OC products
  /*ocProducts.forEach(ocProduct => {
    if (!ocProduct.Name) return;

    const matchingIngramIndices = [];
    ingramData.forEach((_, index) => {
      if (fallbackMatch(ocProduct, index)) {
        matchingIngramIndices.push(index);
        processedIngramIndices.add(index);
      }
    });

    if (matchingIngramIndices.length > 0) {
      const grade = extractGrade(ocProduct.Name);
      const quantity = parseInt(ocProduct.Qty) || 0;
      const gradeCounts = { BN: 0, GB: 0, GA: 0, OB: 0, LN: 0 };
      if (grade) {
        gradeCounts[grade] = quantity;
      }

      matchingIngramIndices.forEach(ingramIndex => {
        const ingramStorage = extractStorage(ingramData[ingramIndex].Product);
        const storageDisplay = ingramStorage ? 
          (ingramStorage.isMultiple ? ingramStorage.sizes.join(',') : ingramStorage.size) 
          : 'N/A';

        results.push({
          model: cleanIngramProduct(ocProduct.Name),
          productName: ingramData[ingramIndex].Product,
          totalQuantity: quantity,
          matchType: 'fallback',
          storage: storageDisplay,
          gradeCounts: `BN:${gradeCounts.BN},GA:${gradeCounts.GA},GB:${gradeCounts.GB},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`,
          matchingProducts: ocProduct.Name,
          ingramIndices: [ingramIndex]
        });
      });
    }
  });*/ //it has few errors which needs to be fixed first

  return results;
};

const LogicComponent = () => {
  const [ocProductData, setOcProductData] = useState([]);
  const [ingramData, setIngramData] = useState([]);
  const [result, setResult] = useState([]);
  const [error, setError] = useState('');

  const handleFileUpload = (file, type) => {
    if (!file) return;

    if (type === 'Phonebot Stock Xlsx') {
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
    } else if (type === 'Ingram xlsx') {
      const reader = new FileReader();
      const fileExtension = file.name.split('.').pop().toLowerCase();
      
      reader.onload = (e) => {
        try {
          let jsonData;
          
          if (fileExtension === 'xlsx') {
            // Handle XLSX file
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            jsonData = XLSX.utils.sheet_to_json(worksheet);
          } else if (fileExtension === 'csv') {
            // Handle CSV file
            const text = e.target.result;
            const result = Papa.parse(text, { header: true });
            jsonData = result.data;
          }
          
          setIngramData(jsonData);
          setError('');
        } catch (error) {
          console.error('Error processing file:', error);
          setError('Error processing Ingram Micro file');
        }
      };
      
      if (fileExtension === 'xlsx') {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
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

  const handleExport = () => {
    try {
      // Create a map of Ingram product indices to their matching results
      const ingramMatchMap = new Map();
      result.forEach(item => {
        item.ingramIndices.forEach(index => {
          if (!ingramMatchMap.has(index)) {
            ingramMatchMap.set(index, {
              quantity: item.totalQuantity,
              gradeCount: item.gradeCounts,
              matchedProducts: item.matchingProducts.split('\n')
                .filter(line => !line.includes('OC Products:') && !line.includes('Matching Ingram Products:') && line.trim())
                .join(' | '), // Use pipe separator instead of newline
              matchType: item.matchType
            });
          }
        });
      });

      // Create enhanced Ingram data with new columns
      const enhancedIngramData = ingramData.map((row, index) => {
        const match = ingramMatchMap.get(index);
        if (match && match.matchType && match.matchType.trim() !== '') {
          return {
            ...row,
            quantity: match.quantity,
            gradeCount: match.gradeCount,
            matchedProducts: match.matchedProducts,
            matchType: match.matchType
          };
        }
        // If no valid match, return the row without adding these fields
        return {
          ...row,
          quantity: '',
          gradeCount: '',
          matchedProducts: '',
          matchType: ''
        };
      });

      // Convert to XLSX
      const ws = XLSX.utils.json_to_sheet(enhancedIngramData);
      
      // Add red background to unmatched rows
      const redFill = { fgColor: { rgb: "FFFF0000" } };
      
      // Apply formatting to unmatched rows
      enhancedIngramData.forEach((row, idx) => {
        if (!row.matchType || row.matchType.trim() === '') {
          // Get the range of cells for this row
          const range = XLSX.utils.decode_range(ws['!ref']);
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: idx + 1, c: col }); // +1 for header row
            if (!ws[cellRef]) ws[cellRef] = { v: '' };
            ws[cellRef].s = { fill: redFill };
          }
        }
      });

      // Create workbook and add the worksheet
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enhanced Ingram Products');

      // Save the file
      XLSX.writeFile(wb, 'enhanced_ingram_products.xlsx');

    } catch (error) {
      console.error('Error exporting XLSX:', error);
      setError('Error exporting XLSX file');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Ingram Product Matcher</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Upload Files</h3>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label>Phonebot Stock Xlsx:</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFileUpload(e.target.files[0], 'Phonebot Stock Xlsx')}
              style={{ display: 'block', marginTop: '5px' }}
            />
          </div>
          <div>
            <label>Ingram Micro (XLSX):</label>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => handleFileUpload(e.target.files[0], 'Ingram xlsx')}
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
        <button 
          onClick={handleExport}
          disabled={!result.length}
          style={{ 
            padding: '10px 20px',
            backgroundColor: !result.length ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !result.length ? 'not-allowed' : 'pointer',
            marginLeft: '10px'
          }}
        >
          Export Enhanced XLSX
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