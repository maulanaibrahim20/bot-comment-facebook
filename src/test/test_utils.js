import { parseSpintax, generateVariations } from '../utils/spintax.js';
import { generate2FACode } from '../utils/twoFactor.js';
import { getAccounts, getTargets, getSettings, paths, hasAccountSession, bulkImportAccounts, deleteAccount } from '../config.js';
import { randomDelay, sleep } from '../utils/delay.js';
import { logger } from '../utils/logger.js';
import { Commenter } from '../core/commenter.js';

console.log('======================================================');
console.log('  🧪 MENJALANKAN UJI COBA OTOMATIS MENYELURUH (TEST)  ');
console.log('======================================================\n');

let totalTests = 0;
let passedTests = 0;

function assertTest(name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    logger.success(`[LULUS] ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    logger.error(`[GAGAL] ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

// 1. Test Spintax Sederhana
console.log('1. Menguji Generator Spintax Sederhana:');
const sampleTemplate = '{Halo|Hai|Permisi} kak, {keren banget|mantap sekali}! {Cek bio ya|Salam kenal}.';
const simpleParsed = parseSpintax(sampleTemplate);
console.log('Template:', sampleTemplate);
console.log('Hasil Spintax:', `"${simpleParsed}"`);
assertTest('Spintax Sederhana', simpleParsed.length > 0 && !simpleParsed.includes('{') && !simpleParsed.includes('}'));

// 2. Test Spintax Bertingkat (Nested Spintax)
console.log('\n2. Menguji Generator Spintax Bertingkat (Nested):');
const nestedTemplate = '{Halo {kak|gan}|Hai {bro|sis}}, {keren {banget|sekali}|luar biasa}!';
const nestedParsed = parseSpintax(nestedTemplate);
console.log('Template Nested:', nestedTemplate);
console.log('Hasil Nested:', `"${nestedParsed}"`);
assertTest('Spintax Nested', nestedParsed.length > 0 && !nestedParsed.includes('{') && !nestedParsed.includes('}'));

// 3. Test Preview Variasi Spintax
console.log('\n3. Menguji Generator Variasi Spintax:');
const variations = generateVariations(sampleTemplate, 3);
variations.forEach((v, i) => console.log(`   Variasi ${i + 1}: "${v}"`));
assertTest('Variasi Spintax', variations.length > 0);

// 4. Test 2FA TOTP Generator (RFC 6238)
console.log('\n4. Menguji Generator 2FA OTP:');
const testSecret = 'JBSWY3DPEHPK3PXP'; // Standard Base32 RFC 6238 test secret
const otp = generate2FACode(testSecret);
console.log(`Secret: ${testSecret} -> Generated OTP: ${otp}`);
assertTest('2FA TOTP Generator', otp && otp.length === 6 && /^\d+$/.test(otp));

// 5. Test Pemuatan Konfigurasi Sistem
console.log('\n5. Menguji Pemuatan Konfigurasi Sistem:');
const accounts = getAccounts();
const targets = getTargets();
const settings = getSettings();
console.log(`- Jumlah Akun aktif: ${accounts.length}`);
console.log(`- Jumlah Target URL: ${targets.length}`);
console.log(`- Viewport Browser: ${settings.browser.viewport.width}x${settings.browser.viewport.height}`);
assertTest('Pemuatan Konfigurasi', accounts !== null && targets !== null && settings !== null);

// 6. Test Bulk Import & Parser
console.log('\n6. Menguji Bulk Account Parser & Auto-Delete:');
const testBulkString = `test_bulk1@gmail.com|pass123|JBSWY3DPEHPK3PXP|http://127.0.0.1:8080\ntest_bulk2@gmail.com|pass456`;
const parsedAccounts = bulkImportAccounts(testBulkString);
console.log(`- Berhasil import ${parsedAccounts.length} akun dummy untuk pengujian`);
assertTest('Bulk Account Import', parsedAccounts.length === 2);

// Hapus akun dummy test
parsedAccounts.forEach(acc => deleteAccount(acc.id));
const accountsAfterDelete = getAccounts();
assertTest('Pembersihan Akun Test', accountsAfterDelete.find(a => a.username === 'test_bulk1@gmail.com') === undefined);

// 7. Test Delay Helper
console.log('\n7. Menguji Helper Delay & Sleep:');
const startT = Date.now();
await sleep(150);
const elapsed = Date.now() - startT;
assertTest('Helper Sleep Delay', elapsed >= 140, `${elapsed}ms`);

// 8. Test Modular Façade & Comment Parser
console.log('\n8. Menguji Modular Façade & Comment Parser:');
const parse1 = Commenter.parseCommentCountString('1,5 rb komentar');
const parse2 = Commenter.parseCommentCountString('2.4k');
const parse3 = Commenter.parseCommentCountString('85 komentar');
console.log(`- "1,5 rb komentar" -> ${parse1}`);
console.log(`- "2.4k" -> ${parse2}`);
console.log(`- "85 komentar" -> ${parse3}`);
const isFaçadeValid = typeof Commenter.postRandomReelsComments === 'function' &&
                      typeof Commenter.postRandomFeedComments === 'function' &&
                      typeof Commenter.postComment === 'function';
assertTest('Modular Façade & Comment Parser', parse1 === 1500 && parse2 === 2400 && parse3 === 85 && isFaçadeValid);

console.log('\n======================================================');
if (passedTests === totalTests) {
  console.log(`  🎉 SEMUA UJI COBA BERHASIL LULUS 100%! (${passedTests}/${totalTests} Test) `);
} else {
  console.log(`  ⚠️ SEBAGIAN UJI COBA GAGAL (${passedTests}/${totalTests} Test) `);
}
console.log('======================================================\n');
