import fs from "fs";
import path from "path";
import mime from "mime-types";
import { SocksProxyAgent } from "socks-proxy-agent";
import fetch from "node-fetch";

// --- Configuration ---
const storagePath = process.env.MOODY_STORAGE_PATH;
const proxyUrl = process.env.SOCKS_PROXY || "socks5h://127.0.0.1:7897";
const workerEndpoint = process.env.WORKER_ENDPOINT || "https://api-r2.changgepd.top";
const migrateToken = process.env.MIGRATE_TOKEN || "MoodyMigrate2025Secret";
const MANIFEST_KEY = "manifest.json";

// --- Argument Parsing ---
const args = process.argv.slice(2);
const targetArgIndex = args.indexOf("--target");
const targetFilter = targetArgIndex !== -1 ? args[targetArgIndex + 1] : null;

const daysArgIndex = args.indexOf("--days");
const daysFilter = daysArgIndex !== -1 ? parseInt(args[daysArgIndex + 1]) : null;

const agent = proxyUrl ? new SocksProxyAgent(proxyUrl) : null;
let stats = { total: 0, skipped: 0, uploaded: 0, errors: 0 };
let manifest = { version: 1, lastSynced: "", files: {} };

console.log(`🚀 Starting Scientific R2 Storage Sync`);
if (targetFilter) console.log(`🎯 Target Filter: ${targetFilter}`);
if (daysFilter) console.log(`📅 Days Filter: Last ${daysFilter} days`);
console.log(`🌐 Worker Endpoint: ${workerEndpoint}`);
console.log(`📂 Storage Path: ${storagePath}`);

// --- Core Functions ---

async function getManifest() {
    console.log("📥 [Manifest] Fetching from R2...");
    const url = `${workerEndpoint}/${encodeURIComponent(MANIFEST_KEY)}`;
    try {
        const res = await fetch(url, {
            headers: { "Authorization": `Bearer ${migrateToken}` },
            agent
        });
        if (res.ok) {
            manifest = await res.json();
            console.log(`✅ [Manifest] Loaded ${Object.keys(manifest.files).length} file records.`);
        } else {
            console.log("ℹ️ [Manifest] Not found on R2, will build as we go.");
        }
    } catch (err) {
        console.warn(`⚠️ [Manifest] Fetch failed: ${err.message}. Starting fresh.`);
    }
}

async function saveManifest() {
    console.log("\n📤 [Manifest] Updating R2...");
    manifest.lastSynced = new Date().toISOString();
    const url = `${workerEndpoint}/${encodeURIComponent(MANIFEST_KEY)}`;
    try {
        const res = await fetch(url, {
            method: "PUT",
            body: JSON.stringify(manifest, null, 2),
            headers: {
                "Authorization": `Bearer ${migrateToken}`,
                "Content-Type": "application/json"
            },
            agent
        });
        if (res.ok) {
            console.log("✅ [Manifest] Successfully updated on R2.");
        } else {
            console.error(`❌ [Manifest] Update failed: ${res.status}`);
        }
    } catch (err) {
        console.error(`❌ [Manifest] Update error: ${err.message}`);
    }
}

/**
 * Checks if file exists on R2 via custom worker endpoint
 */
async function remoteFileExists(key) {
    const url = `${workerEndpoint}/${encodeURIComponent(key)}`;
    try {
        const res = await fetch(url, {
            method: "HEAD",
            headers: { "Authorization": `Bearer ${migrateToken}` },
            agent
        });
        return res.status === 200;
    } catch (err) {
        return false;
    }
}

async function uploadFile(localPath, key) {
    const contentType = localPath ? (mime.lookup(localPath) || "application/octet-stream") : "application/x-directory";
    const body = localPath ? fs.createReadStream(localPath) : "";
    const fileSize = localPath ? fs.statSync(localPath).size : 0;

    const url = `${workerEndpoint}/${encodeURIComponent(key)}`;

    try {
        const res = await fetch(url, {
            method: "PUT",
            body,
            headers: {
                "Authorization": `Bearer ${migrateToken}`,
                "Content-Type": contentType
            },
            agent,
            timeout: 300000
        });
        if (res.ok) {
            console.log(`✅ [Success] ${key}`);
            stats.uploaded++;
            // Update manifest
            manifest.files[key] = { size: fileSize, timestamp: new Date().toISOString() };
            return true;
        } else {
            throw new Error(`Worker returned ${res.status}`);
        }
    } catch (err) {
        console.error(`❌ [Failed] ${key}: ${err.message}`);
        stats.errors++;
        return false;
    }
}

async function syncDir(dir, prefix = "") {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    // Handle empty directory
    const validEntries = entries.filter(e => !e.name.startsWith("."));
    if (validEntries.length === 0 && prefix !== "") {
        const keepKey = `${prefix}/.keep`;
        if (manifest.files[keepKey]) {
            stats.skipped++;
            return;
        }
        if (await remoteFileExists(keepKey)) {
            manifest.files[keepKey] = { size: 0, timestamp: new Date().toISOString() };
            stats.skipped++;
            return;
        }
        await uploadFile(null, keepKey);
        return;
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        const key = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            await syncDir(fullPath, key);
        } else if (entry.isFile()) {
            stats.total++;
            const stat = fs.statSync(fullPath);
            const localSize = stat.size;
            
            // Apply Days Filter if provided
            if (daysFilter !== null) {
                const mtime = stat.mtimeMs;
                if ((now - mtime) > (daysFilter * dayMs)) {
                    stats.skipped++;
                    continue;
                }
            }

            // 1. Check manifest for deduplication
            if (manifest.files[key] && manifest.files[key].size === localSize) {
                stats.skipped++;
            } else {
                // 2. Fallback: If not in manifest, check if really on R2
                if (!manifest.files[key] && await remoteFileExists(key)) {
                    manifest.files[key] = { size: localSize, timestamp: new Date().toISOString() };
                    stats.skipped++;
                } else {
                    console.log(`📤 [Syncing] ${key} (${(localSize / 1024 / 1024).toFixed(2)} MB)...`);
                    await uploadFile(fullPath, key);
                }
            }
        }
    }
}

// --- Main ---
async function main() {
    await getManifest();

    console.log(`\n--- Processing Assets ---`);
    
    if (targetFilter) {
        // Targeted sync
        const targetPath = path.join(storagePath, targetFilter);
        if (fs.existsSync(targetPath)) {
            const isDir = fs.statSync(targetPath).isDirectory();
            if (isDir) {
                console.log(`📂 Scanning directory ${targetFilter}...`);
                await syncDir(targetPath, targetFilter);
            } else {
                console.log(`📄 Syncing single file ${targetFilter}...`);
                await uploadFile(targetPath, targetFilter);
            }
        } else {
            console.error(`❌ Target not found: ${targetPath}`);
        }
    } else {
        // Full sync but scoped to important targets
        const syncTargets = ["music", "lyrics", "covers", "welcome_covers", "db", "metadata"];
        for (const target of syncTargets) {
            const targetPath = path.join(storagePath, target);
            if (fs.existsSync(targetPath)) {
                console.log(`📂 Scanning ${target}...`);
                await syncDir(targetPath, target);
            }
        }
    }

    await saveManifest();

    console.log(`\n🏁 Sync Complete!`);
    console.log(`📦 Total Processed: ${stats.total} | ✅ Uploaded: ${stats.uploaded} | ⏭️ Skipped: ${stats.skipped} | ❌ Errors: ${stats.errors}`);
}

main().catch(console.error);

