/** Helpers to check the current connection mode without reading full settings everywhere. */

import { getSettings, type ConnectionMode } from "./settings";

/** Get the current connection mode. */
export async function getConnectionMode(): Promise<ConnectionMode> {
  const settings = await getSettings();
  return settings.connection_mode;
}

/** Check if the extension is running in Direct Mode. */
export async function isDirectMode(): Promise<boolean> {
  return (await getConnectionMode()) === "direct";
}
