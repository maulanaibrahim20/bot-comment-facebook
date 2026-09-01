import { showMainMenu } from './cli.js';

// Jalankan Menu Utama Bot
showMainMenu().catch((err) => {
  console.error('Terjadi kesalahan fatal pada bot:', err);
  process.exit(1);
});
