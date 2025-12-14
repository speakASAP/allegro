/**
 * Test script to validate Client Secret encryption/decryption flow
 * Tests the same procedures used in the settings form to save and retrieve secrets
 * Validates secret at every step to detect truncation issues
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { config } = require('dotenv');
const { join } = require('path');

// Load .env file
config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

// Get encryption key from environment
const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey) {
  console.error('❌ ENCRYPTION_KEY not found in .env file');
  process.exit(1);
}

if (encryptionKey.length < 32) {
  console.error(`❌ ENCRYPTION_KEY must be at least 32 characters (current: ${encryptionKey.length})`);
  process.exit(1);
}

const encryptionAlgorithm = 'aes-256-cbc';

/**
 * Encrypt text (same as SettingsService.encrypt)
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(encryptionAlgorithm, Buffer.from(encryptionKey.slice(0, 32), 'utf8'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt text (same as SettingsService.decrypt)
 */
function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted format: expected "iv:encrypted"');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(encryptionAlgorithm, Buffer.from(encryptionKey.slice(0, 32), 'utf8'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Calculate encrypted length for a given original length
 * Format: iv(32 hex chars) + ':' + encrypted(original_length * 2 hex chars)
 */
function calculateEncryptedLength(originalLength) {
  return 32 + 1 + (originalLength * 2); // IV + ':' + hex encoded data
}

/**
 * Test with a specific secret length
 */
async function testSecretLength(testUserId, originalSecret, testName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 TEST: ${testName}`);
  console.log(`${'='.repeat(80)}`);
  
  const originalLength = originalSecret.length;
  const expectedEncryptedLength = calculateEncryptedLength(originalLength);
  const dbFieldMaxLength = 500;
  
  console.log(`📊 Original Secret Length: ${originalLength} characters`);
  console.log(`📊 Expected Encrypted Length: ${expectedEncryptedLength} characters`);
  console.log(`📊 Database Field Max Length: ${dbFieldMaxLength} characters`);
  console.log(`📊 Original Secret (first 20 chars): ${originalSecret.substring(0, 20)}...`);
  console.log(`📊 Original Secret (last 20 chars): ...${originalSecret.substring(originalLength - 20)}`);
  
  if (expectedEncryptedLength > dbFieldMaxLength) {
    console.log(`⚠️  WARNING: Encrypted length (${expectedEncryptedLength}) exceeds database field max (${dbFieldMaxLength})`);
    console.log(`⚠️  This will cause TRUNCATION!`);
  }
  
  // Step 1: Encrypt (like updateSettings does)
  console.log(`\n🔐 Step 1: Encrypting secret...`);
  let encryptedSecret;
  try {
    encryptedSecret = encrypt(originalSecret);
    const actualEncryptedLength = encryptedSecret.length;
    console.log(`✅ Encryption successful`);
    console.log(`   Encrypted length: ${actualEncryptedLength} characters`);
    console.log(`   Encrypted (first 40 chars): ${encryptedSecret.substring(0, 40)}...`);
    
    if (actualEncryptedLength !== expectedEncryptedLength) {
      console.log(`⚠️  WARNING: Encrypted length mismatch! Expected ${expectedEncryptedLength}, got ${actualEncryptedLength}`);
    }
    
    if (actualEncryptedLength > dbFieldMaxLength) {
      console.log(`❌ ERROR: Encrypted length (${actualEncryptedLength}) exceeds database max (${dbFieldMaxLength})`);
      console.log(`❌ This will be TRUNCATED when saved to database!`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Encryption failed: ${error.message}`);
    return false;
  }
  
  // Step 2: Save to database (like updateSettings does)
  console.log(`\n💾 Step 2: Saving to database...`);
  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId: testUserId },
      update: {
        allegroClientSecret: encryptedSecret,
      },
      create: {
        userId: testUserId,
        allegroClientSecret: encryptedSecret,
      },
    });
    
    const storedLength = settings.allegroClientSecret?.length || 0;
    console.log(`✅ Database save successful`);
    console.log(`   Stored encrypted length: ${storedLength} characters`);
    console.log(`   Stored (first 40 chars): ${settings.allegroClientSecret?.substring(0, 40)}...`);
    
    if (storedLength !== encryptedSecret.length) {
      console.log(`❌ ERROR: Stored length (${storedLength}) differs from encrypted length (${encryptedSecret.length})`);
      console.log(`❌ TRUNCATION DETECTED!`);
      return false;
    }
    
    if (storedLength > dbFieldMaxLength) {
      console.log(`❌ ERROR: Stored length (${storedLength}) exceeds database max (${dbFieldMaxLength})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Database save failed: ${error.message}`);
    if (error.message.includes('value too long')) {
      console.log(`❌ Database field is too small for encrypted value!`);
    }
    return false;
  }
  
  // Step 3: Read from database (like getSettings does)
  console.log(`\n📖 Step 3: Reading from database...`);
  let storedEncryptedSecret;
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: testUserId },
      select: {
        allegroClientSecret: true,
      },
    });
    
    if (!settings || !settings.allegroClientSecret) {
      console.log(`❌ No secret found in database`);
      return false;
    }
    
    storedEncryptedSecret = settings.allegroClientSecret;
    const readLength = storedEncryptedSecret.length;
    console.log(`✅ Database read successful`);
    console.log(`   Read encrypted length: ${readLength} characters`);
    console.log(`   Read (first 40 chars): ${storedEncryptedSecret.substring(0, 40)}...`);
    
    if (readLength !== encryptedSecret.length) {
      console.log(`❌ ERROR: Read length (${readLength}) differs from saved length (${encryptedSecret.length})`);
      console.log(`❌ TRUNCATION DETECTED during read!`);
      return false;
    }
    
    if (storedEncryptedSecret !== encryptedSecret) {
      console.log(`❌ ERROR: Read value differs from saved value!`);
      console.log(`   Saved: ${encryptedSecret.substring(0, 50)}...`);
      console.log(`   Read:  ${storedEncryptedSecret.substring(0, 50)}...`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Database read failed: ${error.message}`);
    return false;
  }
  
  // Step 4: Decrypt (like getSettings does)
  console.log(`\n🔓 Step 4: Decrypting secret...`);
  let decryptedSecret;
  try {
    decryptedSecret = decrypt(storedEncryptedSecret);
    const decryptedLength = decryptedSecret.length;
    console.log(`✅ Decryption successful`);
    console.log(`   Decrypted length: ${decryptedLength} characters`);
    console.log(`   Decrypted (first 20 chars): ${decryptedSecret.substring(0, 20)}...`);
    console.log(`   Decrypted (last 20 chars): ...${decryptedSecret.substring(decryptedLength - 20)}`);
    
    if (decryptedLength !== originalLength) {
      console.log(`❌ ERROR: Decrypted length (${decryptedLength}) differs from original length (${originalLength})`);
      console.log(`❌ TRUNCATION DETECTED during decryption!`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Decryption failed: ${error.message}`);
    console.log(`   This might indicate truncation or corruption of encrypted data`);
    return false;
  }
  
  // Step 5: Validate content matches
  console.log(`\n✅ Step 5: Validating content...`);
  if (decryptedSecret !== originalSecret) {
    console.log(`❌ ERROR: Decrypted secret does not match original!`);
    console.log(`   Original length: ${originalLength}`);
    console.log(`   Decrypted length: ${decryptedSecret.length}`);
    console.log(`   Original (first 50): ${originalSecret.substring(0, 50)}`);
    console.log(`   Decrypted (first 50): ${decryptedSecret.substring(0, 50)}`);
    if (originalLength > 50) {
      console.log(`   Original (last 50): ...${originalSecret.substring(originalLength - 50)}`);
      console.log(`   Decrypted (last 50): ...${decryptedSecret.substring(decryptedSecret.length - 50)}`);
    }
    return false;
  }
  
  console.log(`✅ Content validation passed - secret matches perfectly!`);
  
  // Step 6: Test validation with Allegro API (if ALLEGRO_AUTH_URL is set)
  if (process.env.ALLEGRO_AUTH_URL) {
    console.log(`\n🌐 Step 6: Testing validation with Allegro API...`);
    const axios = require('axios');
    try {
      const response = await axios.post(
        process.env.ALLEGRO_AUTH_URL,
        new URLSearchParams({
          grant_type: 'client_credentials',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          auth: {
            username: process.env.ALLEGRO_CLIENT_ID || 'test-client-id',
            password: decryptedSecret,
          },
          timeout: 30000,
        }
      );
      
      if (response.data && response.data.access_token) {
        console.log(`✅ Allegro API validation successful with decrypted secret`);
      } else {
        console.log(`⚠️  Allegro API returned unexpected response (but no error)`);
      }
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log(`⚠️  Allegro API validation failed (expected if using test credentials)`);
        console.log(`   This is OK - we're just testing that the secret can be used`);
      } else {
        console.log(`⚠️  Allegro API validation error: ${error.message}`);
        console.log(`   This is OK - we're just testing that the secret is not corrupted`);
      }
    }
  } else {
    console.log(`\n⚠️  Step 6: Skipping Allegro API validation (ALLEGRO_AUTH_URL not set)`);
  }
  
  console.log(`\n✅ TEST PASSED: ${testName}`);
  return true;
}

/**
 * Main test function
 */
async function main() {
  const testUserId = 'test-encryption-validation-user';
  
  console.log('🔍 Client Secret Encryption/Decryption Test Script');
  console.log('='.repeat(80));
  console.log(`Test User ID: ${testUserId}`);
  console.log(`Encryption Key Length: ${encryptionKey.length} characters`);
  console.log(`Database Field Max: 500 characters (VarChar(500))`);
  console.log(`Encryption Format: iv(32 hex) + ':' + encrypted(hex)`);
  
  // Calculate max original length that fits in database
  // encrypted_length = 32 + 1 + (original_length * 2) <= 500
  // original_length * 2 <= 467
  // original_length <= 233.5
  const maxOriginalLength = Math.floor((500 - 33) / 2);
  console.log(`Max Original Length (no truncation): ${maxOriginalLength} characters`);
  
  const results = [];
  
  // Test 1: Short secret (typical length ~50-100 chars)
  const shortSecret = 'a'.repeat(80);
  results.push({
    name: 'Short Secret (80 chars)',
    passed: await testSecretLength(testUserId, shortSecret, 'Short Secret (80 chars)'),
  });
  
  // Test 2: Medium secret (around 150 chars)
  const mediumSecret = 'b'.repeat(150);
  results.push({
    name: 'Medium Secret (150 chars)',
    passed: await testSecretLength(testUserId, mediumSecret, 'Medium Secret (150 chars)'),
  });
  
  // Test 3: Long secret (close to max, 230 chars)
  const longSecret = 'c'.repeat(230);
  results.push({
    name: 'Long Secret (230 chars)',
    passed: await testSecretLength(testUserId, longSecret, 'Long Secret (230 chars)'),
  });
  
  // Test 4: Very long secret (will be truncated, 300 chars)
  const veryLongSecret = 'd'.repeat(300);
  results.push({
    name: 'Very Long Secret (300 chars - WILL TRUNCATE)',
    passed: await testSecretLength(testUserId, veryLongSecret, 'Very Long Secret (300 chars - WILL TRUNCATE)'),
  });
  
  // Test 5: Realistic Allegro client secret format (usually 40-60 chars, but can be longer)
  const realisticSecret = 'AllegroClientSecret_' + 'x'.repeat(60) + '_' + Date.now().toString();
  results.push({
    name: `Realistic Secret (${realisticSecret.length} chars)`,
    passed: await testSecretLength(testUserId, realisticSecret, `Realistic Secret (${realisticSecret.length} chars)`),
  });
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'='.repeat(80)}`);
  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${index + 1}. ${result.name}: ${status}`);
  });
  
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`\nTotal: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount < totalCount) {
    console.log(`\n❌ Some tests failed - check the output above for details`);
    process.exit(1);
  } else {
    console.log(`\n✅ All tests passed!`);
  }
}

// Run tests
main()
  .catch((error) => {
    console.error('❌ Test script error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

