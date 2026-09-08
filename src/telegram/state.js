// State bot dan kampanye berjalan
export const campaignState = {
  isRunning: false,
  info: {
    mode: "",
    target: 0,
    completed: 0,
    currentAccount: ""
  }
};

// Menyimpan state user (misal sedang menunggu input komentar custom, delay, akun baru, OTP)
export const userStates = new Map();

// Menyimpan state pilihan sementara sebelum kampanye dieksekusi
export const pendingCampaigns = new Map();

// Penyimpanan sementara kode OTP manual yang dikirim user via chat Telegram
export const manualOtpStore = new Map();

// Akun yang sedang menunggu input OTP atau persetujuan
export const waitingOtpAccounts = new Set();

export function isCampaignRunning() {
  return campaignState.isRunning;
}

export function setCampaignRunning(running) {
  campaignState.isRunning = running;
}

export function getCampaignInfo() {
  return campaignState.info;
}

export function setCampaignInfo(info) {
  campaignState.info = { ...campaignState.info, ...info };
}

export function incrementCampaignCompleted() {
  campaignState.info.completed++;
}

export function resetCampaignInfo() {
  campaignState.info = {
    mode: "",
    target: 0,
    completed: 0,
    currentAccount: ""
  };
}
