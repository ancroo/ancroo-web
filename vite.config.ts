import { execSync } from "child_process";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.json";

interface VersionInfo {
  /** Human-readable version, e.g. "1.2.3", "1.2.3-dev.5", or commit hash */
  version: string;
  /** Chrome-compatible version (integers and dots only), e.g. "1.2.3" or "1.2.3.5" */
  chromeVersion: string;
  /** Short commit hash, e.g. "abcdef" */
  commit: string;
}

function getVersionInfo(): VersionInfo {
  try {
    const describe = execSync("git describe --tags --always --match 'v*'")
      .toString()
      .trim();
    const commit = execSync("git rev-parse --short HEAD").toString().trim();

    // Exactly on a tag: "v1.2.3"
    const exactMatch = describe.match(/^v(\d+\.\d+\.\d+)$/);
    if (exactMatch) {
      return { version: exactMatch[1], chromeVersion: exactMatch[1], commit };
    }

    // After a tag: "v1.2.3-5-gabcdef"
    const devMatch = describe.match(/^v(\d+\.\d+\.\d+)-(\d+)-g[0-9a-f]+$/);
    if (devMatch) {
      return {
        version: `${devMatch[1]}-dev.${devMatch[2]}`,
        chromeVersion: `${devMatch[1]}.${devMatch[2]}`,
        commit,
      };
    }

    // No v* tags: just a commit hash
    return { version: commit, chromeVersion: "0.0.0", commit };
  } catch {
    return { version: "dev", chromeVersion: "0.0.0", commit: "dev" };
  }
}

const versionInfo = getVersionInfo();
const dynamicManifest = { ...manifest, version: versionInfo.chromeVersion };

export default defineConfig({
  plugins: [preact(), tailwindcss(), crx({ manifest: dynamicManifest })],
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.version),
    __COMMIT_HASH__: JSON.stringify(versionInfo.commit),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
