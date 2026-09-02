import { registerHelpHandlers } from "./help.js";
import { registerSettingsHandlers } from "./settings.js";
import { registerAccountHandlers } from "./accounts.js";
import { registerCampaignHandlers } from "./campaigns.js";
import { registerTextInputHandler } from "./textInput.js";

export function registerHandlers(bot) {
  registerHelpHandlers(bot);
  registerSettingsHandlers(bot);
  registerAccountHandlers(bot);
  registerCampaignHandlers(bot);
  registerTextInputHandler(bot);
}
