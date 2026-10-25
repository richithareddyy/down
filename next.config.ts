import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  // The Discord bridge runs only on the server; load it from node_modules instead of bundling it.
  serverExternalPackages: ["discord.js", "@discordjs/ws", "zlib-sync"],
};
export default config;
