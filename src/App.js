//working airpods
import React, { useState } from 'react';
import Papa from 'papaparse';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import StockMatcher from './StockMatcher.tsx';

const App = () => {
  const [ocProductData, setOcProductData] = useState([]);
  const [ingramData, setIngramData] = useState([]);
  const [ocProductDescData, setOcProductDescData] = useState([]);
  const [result, setResult] = useState([]);
  const [ingramWithQuantities, setIngramWithQuantities] = useState([]);
  const [uploadStatus, setUploadStatus] = useState({
    ocProduct: false,
    ingramMicro: false,
    ocProductDesc: false
  });

  // Expected columns for each file
  const expectedColumns = {
    ocProduct: ['model', 'product_id', 'quantity'],
    ingramMicro: ['Product', 'Grade'],
    ocProductDesc: ['product_id', 'name']
  };

  // Helper function to handle file upload
  const handleFileUpload = (file, type) => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        // Validate columns
        const headers = Object.keys(results.data[0] || {});
        const missing = expectedColumns[type].filter(col => !headers.includes(col));
        
        if (missing.length > 0) {
          alert(`Error: Missing required columns in ${type}: ${missing.join(', ')}`);
          return;
        }

        // Update the corresponding state
        switch(type) {
          case 'ocProduct':
            setOcProductData(results.data);
            setUploadStatus(prev => ({ ...prev, ocProduct: true }));
            break;
          case 'ingramMicro':
            setIngramData(results.data);
            setUploadStatus(prev => ({ ...prev, ingramMicro: true }));
            break;
          case 'ocProductDesc':
            setOcProductDescData(results.data);
            setUploadStatus(prev => ({ ...prev, ocProductDesc: true }));
            break;
          default:
            break;
        }
      },
      error: (err) => {
        console.error(`Error loading CSV file: ${err}`);
        alert(`Error loading CSV file: ${err}`);
      }
    });
  };

  // Helper function to clean and normalize product names
  const normalizeProductName = (name) => {
    return name
      .replace(/5G\s+/g, '') // Remove 5G with trailing space
      .replace(/\[[^\]]*\]/g, '') // Remove grade in square brackets
      .replace(/\((\d+)GB\)/g, '($1)') // Remove GB from parenthesis
      .replace(/[()]/g, ' ') // Remove parentheses
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing spaces
  };

  // Helper function to get name variations (for Plus/+ handling)
  const getNameVariations = (name) => {
    const variations = [name];
    
    // If name contains "Plus", add version with "+"
    if (name.includes(' Plus')) {
      variations.push(name.replace(' Plus', '+'));
    }
    // If name contains "+", add version with "Plus"
    else if (name.includes('+')) {
      variations.push(name.replace('+', ' Plus'));
    }
    
    return variations;
  };

  // Helper function to extract storage from product name
  const extractStorage = (name) => {
    // Look for storage in parentheses first
    const parenthesesMatch = name.match(/\(([0-9.]+)\s*(?:GB|TB)\)/i);
    if (parenthesesMatch) {
      return parenthesesMatch[1];
    }
    
    // If not in parentheses, look for any storage mention
    const storageMatch = name.match(/([0-9.]+)\s*(?:GB|TB)/i);
    if (storageMatch) {
      return storageMatch[1];
    }
    
    return '';
  };

  // Helper function to clean storage from product name
  const removeStorage = (name) => {
    return name
      .replace(/\(\d+\s*(?:GB|TB)\)/gi, '') // Remove storage in parentheses
      .replace(/\d+\s*(?:GB|TB)/gi, '') // Remove storage without parentheses
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing spaces
  };

  // Helper function to normalize model number
  const normalizeModel = (model) => {
    return model.toUpperCase().trim();
  };

  // Helper function to safely parse quantity
  const parseQuantity = (value) => {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 ? num : 0;
  };

  // Helper function to extract grade from product name
  const extractGrade = (name) => {
    if (name.includes('[Brand New]')) return 'GB';
    if (name.includes('[Open Box]')) return 'OB';
    if (name.includes('[Like New]')) return 'LN';
    const gradeMatch = name.match(/\[Grade\s*([A-C])\]/i);
    if (gradeMatch && gradeMatch[1].toUpperCase() === 'A') return 'GA';
    if (gradeMatch && gradeMatch[1].toUpperCase() === 'B') return 'GB';
    return '';
  };

  // Process data when all files are uploaded
  const processData = () => {
    if (!ocProductData.length || !ingramData.length || !ocProductDescData.length) {
      alert('Please upload all required files first.');
      return;
    }

    const resultsArray = [];
    const ingramMatches = new Map();
    const matchedIngramIndices = new Set(); // Keep track of matched Ingram products

    // First find all matches for each OC model
    const modelMatches = new Map(); // model -> Map of storage -> Set of Ingram indices

    // First pass: Group OC products by model and storage
    const ocModelStorages = new Map(); // model -> Set of storages
    ocProductData.filter(p => p.model).forEach(ocProduct => {
      const model = normalizeModel(ocProduct.model);
      const descMatch = ocProductDescData.find(item => 
        item.product_id === ocProduct.product_id
      );
      
      if (!descMatch) return;
      
      // Extract storage from description
      const storage = extractStorage(descMatch.name);
      
      if (!ocModelStorages.has(model)) {
        ocModelStorages.set(model, new Set());
      }
      ocModelStorages.get(model).add(storage);
    });

    // Now process each model and its storages
    ocModelStorages.forEach((storages, model) => {
      console.log('Processing model:', model, 'storages:', Array.from(storages));
      
      // Find all Ingram products that match this model
      ingramData.forEach((ingramItem, ingramIndex) => {
        const ingramProduct = ingramItem.Product.toUpperCase();
        
        // Check for exact model match (with spaces before/after)
        const modelRegex = new RegExp(`(^|\\s)${model}(\\s|$)`);
        if (!modelRegex.test(ingramProduct)) return;

        // If we found the model, check which storage variant it matches
        const ingramStorage = extractStorage(ingramProduct);
        
        // For each storage variant of this model
        storages.forEach(storage => {
          if (storage === ingramStorage) {
            const key = storage ? `${model} (${storage})` : model;
            if (!modelMatches.has(key)) {
              modelMatches.set(key, new Set());
            }
            modelMatches.get(key).add(ingramIndex);
            matchedIngramIndices.add(ingramIndex);
            console.log('Found match for', key, 'in:', ingramProduct);
          }
        });
      });
    });

    // After model matching is done, do name matching for remaining products
    console.log('Starting name matching for remaining products...');
    
    // Group OC products by clean name
    const nameMatches = new Map(); // cleanName -> Set of Ingram indices

    // Process each OC product for name matching
    ocProductData.forEach(ocProduct => {
      const descMatch = ocProductDescData.find(item => 
        item.product_id === ocProduct.product_id
      );
      if (!descMatch) return;

      // Clean and process the product name
      const cleanName = normalizeProductName(descMatch.name);
      const storage = extractStorage(descMatch.name);
      const key = cleanName;

      console.log('Processing OC product:', {
        original: descMatch.name,
        cleaned: cleanName,
        storage
      });

      // Get possible name variations
      const nameVariations = getNameVariations(cleanName);
      console.log('Name variations:', nameVariations);

      // Find matching Ingram products that weren't matched by model
      ingramData.forEach((ingramItem, ingramIndex) => {
        // Skip if already matched by model
        if (matchedIngramIndices.has(ingramIndex)) return;

        // Check if Ingram product starts with any of our name variations
        const hasMatch = nameVariations.some(variation => 
          ingramItem.Product.startsWith(variation)
        );

        if (hasMatch) {
          if (!nameMatches.has(key)) {
            nameMatches.set(key, new Set());
          }
          nameMatches.get(key).add(ingramIndex);
          matchedIngramIndices.add(ingramIndex);
          console.log('Found name match:', key, 'in:', ingramItem.Product);
        }
      });
    });

    // Process matches and count quantities
    modelMatches.forEach((matchingIndices, key) => {
      console.log('Processing matches for:', key);
      const [model, storagePart] = key.split(' (');
      const storage = storagePart ? storagePart.replace(')', '') : null;

      // Find all OC products with this model and storage
      const matchingOcProducts = ocProductData.filter(p => {
        if (!p.model || normalizeModel(p.model) !== model) return false;
        
        const descMatch = ocProductDescData.find(item => 
          item.product_id === p.product_id
        );
        if (!descMatch) return false;

        const productStorage = extractStorage(descMatch.name);
        return storage ? productStorage === storage : true;
      });

      if (matchingOcProducts.length > 0) {
        // Initialize grade counters
        const gradeCounts = {
          GB: 0, // Brand New
          GA: 0, // Grade A
          OB: 0, // Open Box
          LN: 0  // Like New
        };

        // Count quantities by grade
        matchingOcProducts.forEach(ocProduct => {
          const descMatch = ocProductDescData.find(item => 
            item.product_id === ocProduct.product_id
          );
          if (!descMatch) return;

          const quantity = parseQuantity(ocProduct.quantity);
          console.log('Found quantity:', quantity, 'for product:', descMatch.name);

          if (descMatch.name.includes('[Brand New]')) {
            gradeCounts.GB += quantity;
          } else if (descMatch.name.includes('[Open Box]')) {
            gradeCounts.OB += quantity;
          } else if (descMatch.name.includes('[Like New]')) {
            gradeCounts.LN += quantity;
          } else {
            const gradeMatch = descMatch.name.match(/\[Grade\s*([A-C])\]/i);
            if (gradeMatch && gradeMatch[1].toUpperCase() === 'A') {
              gradeCounts.GA += quantity;
            }
          }
        });

        // Only add results if we have quantities
        const totalQuantity = Object.values(gradeCounts).reduce((a, b) => a + b, 0);
        if (totalQuantity > 0) {
          const displayString = `Model: ${key} | GB:${gradeCounts.GB},GA:${gradeCounts.GA},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`;
          resultsArray.push(displayString);

          // Store matches for each Ingram item
          Array.from(matchingIndices).forEach(index => {
            if (!ingramMatches.has(index)) {
              ingramMatches.set(index, []);
            }
            ingramMatches.get(index).push({
              model: key,
              gradeCounts,
              quantity: totalQuantity
            });
          });
        }
      }
    });

    // Process name matches and count quantities
    nameMatches.forEach((matchingIndices, key) => {
      console.log('Processing name matches for:', key);

      // Find all OC products with this name
      const matchingOcProducts = ocProductData.filter(p => {
        const descMatch = ocProductDescData.find(item => 
          item.product_id === p.product_id
        );
        if (!descMatch) return false;

        const cleanName = normalizeProductName(descMatch.name);
        return cleanName === key;
      });

      if (matchingOcProducts.length > 0) {
        // Initialize grade counters
        const gradeCounts = {
          GB: 0, // Brand New and Grade B
          GA: 0, // Grade A
          OB: 0, // Open Box
          LN: 0  // Like New
        };

        // Count quantities by grade
        matchingOcProducts.forEach(ocProduct => {
          const descMatch = ocProductDescData.find(item => 
            item.product_id === ocProduct.product_id
          );
          if (!descMatch) return;

          const quantity = parseQuantity(ocProduct.quantity);
          console.log('Found quantity:', quantity, 'for product:', descMatch.name);

          const grade = extractGrade(descMatch.name);
          if (grade) {
            gradeCounts[grade] += quantity;
          }
        });

        // Only add results if we have quantities
        const totalQuantity = Object.values(gradeCounts).reduce((a, b) => a + b, 0);
        if (totalQuantity > 0) {
          const displayString = `Name: ${key} | GB:${gradeCounts.GB},GA:${gradeCounts.GA},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`;
          resultsArray.push(displayString);

          // Store matches for each Ingram item
          Array.from(matchingIndices).forEach(index => {
            if (!ingramMatches.has(index)) {
              ingramMatches.set(index, []);
            }
            ingramMatches.get(index).push({
              model: key,
              gradeCounts,
              quantity: totalQuantity
            });
          });
        }
      }
    });

    // Create enhanced Ingram data with quantities
    const enhancedIngramData = ingramData.map((item, index) => {
      const matches = ingramMatches.get(index);
      let matchingProducts = '';
      if (matches && matches.length > 0) {
        // Only include matches with quantities
        const matchesWithQuantities = matches.filter(match => 
          Object.values(match.gradeCounts).reduce((a, b) => a + b, 0) > 0
        );
        
        if (matchesWithQuantities.length > 0) {
          matchingProducts = matchesWithQuantities.map(match => 
            `Model: ${match.model} | GB:${match.gradeCounts.GB},GA:${match.gradeCounts.GA},OB:${match.gradeCounts.OB},LN:${match.gradeCounts.LN}`
          ).join('\n');
        }
      }
      return {
        ...item,
        'Matching Products': matchingProducts
      };
    });

    setIngramWithQuantities(enhancedIngramData);
    setResult(resultsArray);
  };

  const downloadEnhancedIngram = () => {
    if (ingramWithQuantities.length === 0) {
      alert('No data to download. Please process the files first.');
      return;
    }

    const csv = Papa.unparse(ingramWithQuantities);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'ingram_with_quantities.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Router>
      <div>
        <nav className="bg-gray-800 p-4">
          <Link to="/" className="text-white mr-4">Home</Link>
          <Link to="/inventory" className="text-white">Inventory</Link>
        </nav>

        <Routes>
          <Route path="/" element={
            <div className="container mx-auto p-4">
              <h1>CSV File Processor</h1>
              
              <div style={{ marginBottom: '20px' }}>
                <h3>Required Files and Columns:</h3>
                <div style={{ marginBottom: '10px' }}>
                  <p><strong>1. OC Product CSV</strong> (Required columns: {expectedColumns.ocProduct.join(', ')})</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e.target.files[0], 'ocProduct')}
                  />
                  {uploadStatus.ocProduct && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <p><strong>2. Ingram Micro CSV</strong> (Required columns: {expectedColumns.ingramMicro.join(', ')})</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e.target.files[0], 'ingramMicro')}
                  />
                  {uploadStatus.ingramMicro && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <p><strong>3. OC Product Description CSV</strong> (Required columns: {expectedColumns.ocProductDesc.join(', ')})</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e.target.files[0], 'ocProductDesc')}
                  />
                  {uploadStatus.ocProductDesc && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={processData}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                  disabled={!uploadStatus.ocProduct || !uploadStatus.ingramMicro || !uploadStatus.ocProductDesc}
                >
                  Process Files
                </button>

                <button 
                  onClick={downloadEnhancedIngram}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                  disabled={ingramWithQuantities.length === 0}
                >
                  Download Ingram CSV with Quantities
                </button>
              </div>

              {result.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3>Results:</h3>
                  {result.map((item, index) => (
                    <div key={index} style={{ 
                      whiteSpace: 'pre-line',
                      marginBottom: '10px',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '5px'
                    }}>
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          } />
          <Route path="/inventory" element={<StockMatcher />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
