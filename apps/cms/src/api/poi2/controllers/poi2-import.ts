/**
 * POI2 CSV Import Controller
 * 
 * Handles CSV file upload and import with slug-based upsert logic
 */

export default {
  async import(ctx: any) {
    try {
      const file = ctx.request.files?.file;
      
      if (!file) {
        return ctx.badRequest('No file uploaded. Please provide a CSV file in the "file" field.');
      }

      const dryRun = ctx.query.dryRun === 'true' || ctx.query.dryRun === '1';

      // Read CSV file (UTF-8)
      // Handle different file upload structures (koa-body can use different property names)
      const fs = require('fs');
      let filePath: string | undefined = file.path || file.filepath || file.tempFilePath;
      let csvContent: string;

      if (filePath) {
        // File was saved to disk
        csvContent = fs.readFileSync(filePath, 'utf8');
      } else if (file.buffer) {
        // File is in memory as buffer
        csvContent = file.buffer.toString('utf8');
      } else {
        return ctx.badRequest('Could not read uploaded file. File structure: ' + JSON.stringify(Object.keys(file)));
      }
      
      // Helper function to parse CSV line with proper quote handling
      const parseCSVLine = (line: string, delimiter: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              // Escaped quote (double quote)
              current += '"';
              i++; // Skip next quote
            } else {
              // Toggle quote state
              inQuotes = !inQuotes;
            }
          } else if (char === delimiter && !inQuotes) {
            // Field separator found outside quotes
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        
        // Add last field
        result.push(current.trim());
        return result;
      };

      // Detect delimiter (try comma, semicolon, tab)
      const detectDelimiter = (firstLine: string): string => {
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;
        
        if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
        if (semicolonCount > commaCount) return ';';
        return ','; // Default to comma
      };

      // Parse CSV lines - handle multi-line quoted fields
      const rawLines = csvContent.split(/\r?\n/);
      const lines: string[] = [];
      let currentLine = '';
      let inQuotes = false;

      for (const rawLine of rawLines) {
        if (currentLine === '') {
          currentLine = rawLine;
        } else {
          currentLine += '\n' + rawLine;
        }

        // Count quotes in the line
        let quoteCount = 0;
        for (let i = 0; i < currentLine.length; i++) {
          if (currentLine[i] === '"' && (i === 0 || currentLine[i - 1] !== '"')) {
            quoteCount++;
          }
        }

        // If even number of quotes, the line is complete
        if (quoteCount % 2 === 0) {
          lines.push(currentLine.trim());
          currentLine = '';
        }
      }

      // Add last line if exists
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }

      // Filter empty lines
      const nonEmptyLines = lines.filter((line: string) => line.length > 0);

      if (nonEmptyLines.length < 2) {
        return ctx.badRequest('CSV file must contain at least a header row and one data row.');
      }

      // Detect delimiter from first line
      const delimiter = detectDelimiter(nonEmptyLines[0]);

      // Parse header
      const headerLine = nonEmptyLines[0];
      const headers = parseCSVLine(headerLine, delimiter).map((h: string) => {
        // Remove surrounding quotes if present
        return h.replace(/^"(.*)"$/, '$1').trim();
      });

      if (!headers.includes('slug')) {
        return ctx.badRequest(`CSV file must contain a "slug" column. Found columns: ${headers.join(', ')}`);
      }

      const dataLines = nonEmptyLines.slice(1);

      // Statistics
      const stats = {
        totalRows: dataLines.length,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as Array<{ line: number; slug: string | null; field?: string; message: string }>
      };

      // Helper functions
      const parseDecimal = (value: string): number | undefined => {
        if (!value || value.trim() === '') return undefined;
        const num = Number(value.replace(',', '.'));
        return isNaN(num) ? undefined : num;
      };

      const parseInteger = (value: string): number | undefined => {
        if (!value || value.trim() === '') return undefined;
        const num = parseInt(value, 10);
        return isNaN(num) ? undefined : num;
      };

      const parseBoolean = (value: string): boolean | undefined => {
        if (!value) return undefined;
        const val = value.toString().trim().toLowerCase();
        if (['1', 'true', 'yes', 'igen'].includes(val)) return true;
        if (['0', 'false', 'no', 'nem'].includes(val)) return false;
        return undefined;
      };

      const parseAgeRating = (value: string): number | undefined => {
        if (!value || value.trim() === '') return undefined;
        const num = parseInt(value, 10);
        if (isNaN(num)) return undefined;
        // Valid values: 0, 7, 12, 16, 18
        if ([0, 7, 12, 16, 18].includes(num)) return num;
        return undefined;
      };

      // Process each row
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        const lineNumber = i + 2; // +2 because: 1 = header, lineNumber starts at 2

        // Skip empty lines
        if (line.trim() === '') {
          stats.skipped++;
          continue;
        }

        // Parse CSV line with proper delimiter and quote handling
        const cols = parseCSVLine(line, delimiter).map((col: string) => {
          // Remove surrounding quotes if present
          return col.replace(/^"(.*)"$/, '$1').trim();
        });
        
        const row: Record<string, string> = {};
        
        headers.forEach((header, idx) => {
          row[header] = cols[idx] !== undefined ? cols[idx] : '';
        });

        // Check for slug (required)
        if (!row.slug || row.slug === '') {
          stats.errors.push({
            line: lineNumber,
            slug: null,
            field: 'slug',
            message: 'Missing slug'
          });
          stats.skipped++;
          continue;
        }

        try {
          // Find existing record by slug
          const existing = await strapi.entityService.findMany('api::poi2.poi2' as any, {
            filters: { slug: row.slug },
            limit: 1
          });

          const isUpdate = existing.length > 0;
          const existingId = isUpdate ? existing[0].id : null;

          // Build payload - only non-empty fields
          const payload: Record<string, any> = {};

          // Handle each field
          for (const [fieldName, rawValue] of Object.entries(row)) {
            // Skip empty values (don't overwrite existing)
            if (rawValue === '' || rawValue === null || rawValue === undefined) {
              continue;
            }

            // Handle __CLEAR__ special value
            if (rawValue === '__CLEAR__') {
              payload[fieldName] = null;
              continue;
            }

            // Type-specific parsing
            if (fieldName === 'slug') {
              payload.slug = rawValue;
            } else if (['lat', 'lng', 'radius_m', 'audio_speed', 'audio_pitch'].includes(fieldName)) {
              const decimalValue = parseDecimal(rawValue);
              if (decimalValue !== undefined) {
                // Field name mapping
                if (fieldName === 'radius_m') {
                  payload.radius = decimalValue;
                } else {
                  payload[fieldName] = decimalValue;
                }
              }
            } else if (['priority', 'sequence_order', 'duration_minutes', 'walking_distance_m_from_prev'].includes(fieldName)) {
              const intValue = parseInteger(rawValue);
              if (intValue !== undefined) {
                payload[fieldName] = intValue;
              }
            } else if (fieldName === 'age_rating') {
              const ageValue = parseAgeRating(rawValue);
              if (ageValue !== undefined) {
                payload.age_rating = ageValue;
              } else {
                stats.errors.push({
                  line: lineNumber,
                  slug: row.slug,
                  field: 'age_rating',
                  message: `Invalid age_rating value: ${rawValue}. Must be 0, 7, 12, 16, or 18.`
                });
              }
            } else if (['active', 'child_friendly'].includes(fieldName)) {
              const boolValue = parseBoolean(rawValue);
              if (boolValue !== undefined) {
                payload[fieldName] = boolValue;
              }
            } else if (['name_hu', 'name_en'].includes(fieldName)) {
              // Simple string fields - name will be set from name_hu or name_en
              if (fieldName === 'name_hu' && rawValue) {
                payload.name = rawValue; // Default to Hungarian
              } else if (fieldName === 'name_en' && rawValue && !payload.name) {
                payload.name = rawValue; // Use English if no Hungarian
              }
            } else if (['intro_hu', 'intro_en', 'interesting_hu', 'interesting_en', 'legends_hu', 'legends_en'].includes(fieldName)) {
              // Blocks fields - simple string for now
              if (fieldName === 'intro_hu' && rawValue) {
                payload.intro = rawValue;
              } else if (fieldName === 'intro_en' && rawValue && !payload.intro) {
                payload.intro = rawValue;
              } else if (fieldName === 'interesting_hu' && rawValue) {
                payload.interesting_facts = rawValue;
              } else if (fieldName === 'interesting_en' && rawValue && !payload.interesting_facts) {
                payload.interesting_facts = rawValue;
              } else if (fieldName === 'legends_hu' && rawValue) {
                payload.legends = rawValue;
              } else if (fieldName === 'legends_en' && rawValue && !payload.legends) {
                payload.legends = rawValue;
              }
            } else {
              // Other text fields
              payload[fieldName] = rawValue;
            }
          }

          // Validate required fields for new records
          if (!isUpdate) {
            if (!payload.name || !payload.lat || !payload.lng) {
              stats.errors.push({
                line: lineNumber,
                slug: row.slug,
                message: 'Missing required fields: name, lat, or lng'
              });
              stats.skipped++;
              continue;
            }
          }

          // Execute create/update (unless dry run)
          if (!dryRun) {
            if (isUpdate && existingId) {
              await strapi.entityService.update('api::poi2.poi2' as any, existingId, {
                data: payload
              });
              stats.updated++;
            } else {
              await strapi.entityService.create('api::poi2.poi2' as any, {
                data: payload
              });
              stats.created++;
            }
          } else {
            // Dry run - just count
            if (isUpdate) {
              stats.updated++;
            } else {
              stats.created++;
            }
          }

          stats.processed++;

        } catch (error: any) {
          stats.errors.push({
            line: lineNumber,
            slug: row.slug,
            message: error.message || 'Unknown error'
          });
          stats.skipped++;
        }
      }

      // Clean up uploaded file (if it was saved to disk)
      const cleanupPath = file.path || file.filepath || file.tempFilePath;
      if (cleanupPath && fs.existsSync(cleanupPath)) {
        fs.unlinkSync(cleanupPath);
      }

      return ctx.send({
        ...stats,
        dryRun
      });

    } catch (error: any) {
      return ctx.internalServerError(`Import failed: ${error.message}`);
    }
  }
};
