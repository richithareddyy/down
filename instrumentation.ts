// Runs once when the Next.js server starts. Starts the Discord bridge when a bot token is set.
// The import must sit inside this check so the edge build never tries to bundle discord.js.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDiscord } = await import("./src/channels/discord");
    startDiscord();
  }
}
