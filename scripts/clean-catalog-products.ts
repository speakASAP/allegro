/**
 * Clean Catalog Products Script
 * 
 * Removes all products and related data from catalog-microservice database.
 * 
 * Usage:
 *   ts-node scripts/clean-catalog-products.ts
 */

import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function cleanCatalogProducts() {
  const catalogUrl = process.env.CATALOG_SERVICE_URL || 'http://catalog:3200';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbUser = process.env.DB_USER || 'dbadmin';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbName = 'catalog';

  console.log('🧹 Starting catalog products cleanup...\n');
  console.log(`Catalog Service URL: ${catalogUrl}`);
  console.log(`Database: ${dbName}@${dbHost}:${dbPort}\n`);

  try {
    // Use direct database connection via psql command
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Construct DATABASE_URL for psql
    const dbUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;
    
    console.log('Deleting product-related data from catalog database...\n');

    // Delete in order to respect foreign key constraints
    const commands = [
      'DELETE FROM product_pricing;',
      'DELETE FROM media;',
      'DELETE FROM product_attributes;',
      'DELETE FROM product_categories;',
      'DELETE FROM products;',
    ];

    for (const cmd of commands) {
      try {
        const { stdout, stderr } = await execAsync(
          `psql "${dbUrl}" -c "${cmd}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );
        if (stdout) console.log(stdout);
        if (stderr && !stderr.includes('DELETE')) console.error(stderr);
      } catch (error: any) {
        console.error(`Error executing: ${cmd}`, error.message);
      }
    }

    // Verify deletion
    try {
      const { stdout } = await execAsync(
        `psql "${dbUrl}" -c "SELECT COUNT(*) as remaining FROM products;"`,
        { maxBuffer: 1024 * 1024 * 10 }
      );
      console.log('\n✅ Verification:');
      console.log(stdout);
    } catch (error: any) {
      console.error('Error verifying deletion:', error.message);
    }

    console.log('\n✅ Catalog products cleanup completed successfully!');
  } catch (error: any) {
    console.error('❌ Error cleaning catalog products:', error);
    throw error;
  }
}

if (require.main === module) {
  cleanCatalogProducts()
    .then(() => {
      console.log('\n✅ Cleanup script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup script failed:', error);
      process.exit(1);
    });
}

export { cleanCatalogProducts };

