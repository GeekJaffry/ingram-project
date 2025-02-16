import React, { useState } from 'react';
import * as XLSX from 'xlsx';

// Color variations mapping for storage extraction
const colorGroups = {
    black: ['black', 'blk', 'blac', 'cosmicblk', 'electricblack', 'fluidblk', 'mdnblk', 'mdnght', 'mdnghtblack', 
            'mdnghtblk', 'mdntblk', 'midnight', 'midnightblack', 'midntblk', 'obsidian', 'spblk', 'sprkleblk', 
            'crftdblk', 'grphtblk', 'glowingblck', 'carbongrey'],
    blue: ['blu', 'blue', 'iceblue', 'icyblue', 'navy', 'saphrblue', 'seablue', 'sirblu', 'skyblu', 'slvblu',
           'cyanlake', 'mdntgryblue', 'slvblu'],
    green: ['green', 'grn', 'mintgreen', 'mintgrn', 'mntgrn', 'epigrn', 'emraldgrn', 'emrldgrn', 'lghtgrn', 
            'sagegrn', 'olive'],
    grey: ['grey', 'gry', 'granitegrey', 'graphite', 'grpht', 'graphitegry', 'onyxgry', 'carbongrey', 'chrcoalgry',
           'hazelgrey', 'lghtgry'],
    purple: ['purple', 'purpl', 'ppl', 'lavender', 'lavndr', 'vilet', 'violet', 'borapurple', 'lvndr',
             'lavndrpink', 'lvndrpink'],
    pink: ['pink', 'pkgld', 'pnkgld', 'lilcpnk', 'lavndrpink', 'lvndrpink', 'peach', 'rose', 'rosegold'],
    gold: ['gold', 'gld', 'pnkgld', 'pkgld', 'rosegold'],
    silver: ['silver', 'silv', 'slv', 'slvr', 'silvr', 'ttnmslv', 'crystlslv'],
    white: ['white', 'wht', 'whte', 'frstdwht', 'prsmwht', 'starlight', 'cloudywhte', 'porcelain'],
    cream: ['cream', 'crem', 'beige'],
    yellow: ['yellow', 'yellw'],
    orange: ['orange', 'ornge', 'orangecopp'],
    red: ['red', 'burgundy', 'burgdy', 'brz']
};

const StockMatcher = () => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{
    ingram: File | null;
    inventory: File | null;
  }>({
    ingram: null,
    inventory: null
  });

  const extractStorage = (normalized: any) => {
    const patterns = [
        /(\d+)\s*gb/i,                    // Standard "GB" format
        /v2\s+(\d+)(?:\s|gb)/i,          // After "v2"
        /5g\s+(\d+)(?:\s|gb)/i,          // After "5G"
        /\s(\d+)\s+(?:black|blk|white|blue|grey|red|cream|violet|green)/i,  // Before color with space
        /\s(\d+)(?:blk|blu|gry|pnkgld|vilet|grn)/i,  // Before concatenated color
        /\s(\d+)\s/                       // Between spaces
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if ([32, 64, 128, 256, 512, 1024].includes(num)) {
          return num.toString();
        }
      }
    }
    return '';
  };

  const getModelAndStorage = (product) => {
    const normalized = product.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/lte|4g/, '')
      .trim();

    // Storage extraction
    const storage = extractStorage(normalized);

    // Model extraction
    let model = '';

    // A series with all variants
    const aMatch = normalized.match(/\sa(\d+[a-z]*)(?:\s|$)/);
    if (aMatch) {
      const baseModel = aMatch[1];
      const version = normalized.includes('v2') ? ' v2' : '';
      const is5G = normalized.includes('5g') ? ' 5g' : '';
      model = `galaxy a${baseModel}${version}${is5G}`;
    }
    // Z series with spacing fixes
    else if (normalized.match(/z\s*(?:flip|fold)/i)) {
      const typeMatch = normalized.match(/z\s*(flip|fold)\s*(\d+)/i);
      if (typeMatch) {
        const [_, type, num] = typeMatch;
        const is5G = normalized.includes('5g') ? ' 5g' : '';
        model = `galaxy z ${type} ${num}${is5G}`.toLowerCase();
      }
    }
    // Note series
    else if (normalized.match(/note\s*20/)) {
      model = normalized.includes('ultra') ? 'galaxy note 20 ultra' : 'galaxy note 20';
    }
    // S series with all variants
    else if (normalized.match(/(?:^|\s)s\d+/)) {
      const numMatch = normalized.match(/(?:^|\s)s(\d+)/);
      if (numMatch) {
        const baseNumber = numMatch[1];
        if (normalized.includes('ultra')) {
          model = `galaxy s${baseNumber} ultra`;
        } else if (normalized.includes('plus') || normalized.includes('+')) {
          model = `galaxy s${baseNumber} plus`;
        } else if (normalized.includes('fe')) {
          model = `galaxy s${baseNumber} fe`;
        } else {
          model = `galaxy s${baseNumber}`;
        }
      }
    }

    return { model, storage };
  };

  const findMatches = (ingramProduct, inventoryData) => {
    const { model, storage } = getModelAndStorage(ingramProduct);
    if (!model || !storage) return [];

    return inventoryData.filter(row => {
      if (!row[0]) return false;
      const invProduct = row[0].toLowerCase()
        .trim();
      
      // Skip accessories
      if (invProduct.includes('case') || 
          invProduct.includes('cover') || 
          invProduct.includes('protector') ||
          invProduct.includes('pen') ||
          invProduct.includes('stylus')) return false;

      // Match model and storage
      const hasModel = invProduct.includes(model);
      const hasStorage = invProduct.includes(storage + 'gb');
      
      return hasModel && hasStorage;
    });
  };

  const calculateStockInfo = (matches) => {
    let total = 0, a = 0, b = 0, likeNew = 0;
    
    matches.forEach(match => {
      const qty = parseInt(match[1]) || 0;
      const name = match[0].toLowerCase();
      
      total += qty;
      if (name.includes('[grade a]')) a += qty;
      else if (name.includes('[grade b]')) b += qty;
      else if (name.includes('[like new]')) likeNew += qty;
    });

    return `total:${total}, a:${a}, b:${b}, like new:${likeNew}`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'ingram' | 'inventory') => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({
        ...prev,
        [type]: e.target.files![0]
      }));
    }
  };

  const analyzeFiles = async () => {
    if (!files.ingram || !files.inventory) {
      setError('Please upload both files first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Read Ingram file
      const ingramBuffer = await files.ingram.arrayBuffer();
      const ingramWorkbook = XLSX.read(new Uint8Array(ingramBuffer), {type: 'array'});
      const ingramSheet = ingramWorkbook.Sheets[ingramWorkbook.SheetNames[0]];
      const ingramData = XLSX.utils.sheet_to_json(ingramSheet, {header: 1});

      // Read Inventory file
      const inventoryBuffer = await files.inventory.arrayBuffer();
      const inventoryWorkbook = XLSX.read(new Uint8Array(inventoryBuffer), {type: 'array'});
      const inventorySheet = inventoryWorkbook.Sheets[inventoryWorkbook.SheetNames[0]];
      const inventoryData = XLSX.utils.sheet_to_json(inventorySheet, {header: 1});

      // Process each row
      const processedResults = [];
      for (let i = 1; i < ingramData.length; i++) {
        const row = ingramData[i];
        const product = row[1];
        
        if (!product) continue;
        if (!product.toLowerCase().includes('samsung')) continue;
        if (product.toLowerCase().match(/(watch|buds|galaxy book)/)) continue;

        const matches = findMatches(product, inventoryData);
        
        processedResults.push({
          product,
          stockInfo: calculateStockInfo(matches),
          matched: matches.length > 0
        });
      }
      
      setResults(processedResults);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Stock Analysis Results</h2>
      
      <div className="mb-6 space-y-4">
        <div>
          <p className="mb-2"><strong>Ingram Sheet:</strong></p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => handleFileUpload(e, 'ingram')}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <div>
          <p className="mb-2"><strong>Inventory Sheet:</strong></p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => handleFileUpload(e, 'inventory')}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <button
          onClick={analyzeFiles}
          disabled={!files.ingram || !files.inventory || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Analyze Files'}
        </button>
      </div>

      {error && (
        <div className="p-4 mb-4 text-red-700 bg-red-100 rounded">
          Error: {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Info</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((result, index) => (
                <tr key={index} className={result.matched ? 'bg-green-50' : 'bg-red-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">{result.product}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{result.stockInfo}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {result.matched ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Matched
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        No Match
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StockMatcher;