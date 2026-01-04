import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.resolve(PACKAGE_ROOT, 'src/schema/plugins');
const EXTERNAL_PACKAGES_ROOT = path.resolve(PACKAGE_ROOT, '../../../packages'); // ../packages relative to NapGram root

// Ensure target directory exists
if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

console.log(`Scanning for plugins in: ${EXTERNAL_PACKAGES_ROOT}`);

// Find all plugin directories
let externalPlugins = [];
if (fs.existsSync(EXTERNAL_PACKAGES_ROOT)) {
    externalPlugins = fs.readdirSync(EXTERNAL_PACKAGES_ROOT).map(name => ({
        name,
        path: path.join(EXTERNAL_PACKAGES_ROOT, name)
    }));
}

let count = 0;

for (const plugin of externalPlugins) {
    if (!fs.statSync(plugin.path).isDirectory()) continue;

    // Check for schema.ts
    const schemaPath = path.join(plugin.path, 'src', 'schema.ts');
    if (fs.existsSync(schemaPath)) {
        console.log(`Found schema in plugin: ${plugin.name}`);

        // Copy schema file
        // Helper to rewrite imports? No, schema files usually just import from drizzle-orm. 
        // If they import from local files, we might break it.
        // Assuming schema.ts is self-contained (only imports drizzle-orm).

        const destPath = path.join(TARGET_DIR, `${plugin.name}.ts`);
        fs.copyFileSync(schemaPath, destPath);
        count++;
    }
}

console.log(`Synced ${count} plugin schemas.`);
