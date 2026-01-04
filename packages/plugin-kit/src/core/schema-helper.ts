
// Helper to extract schemas from loaded plugins for drizzle-kit
// This is a standalone script that initializes the runtime, loads all plugins, 
// and prints their schema paths or structure.
//
// In a real implementation, we would write a 'drizzle-kit-plugin.ts' that 
// iterates over installed plugins and generates a temporary schema.ts exporting all of them.

export function getPluginSchemas(runtime: any) {
    const plugins = runtime.getAllPlugins();
    return plugins
        .filter((p: any) => p.plugin.drizzleSchema)
        .map((p: any) => ({
            id: p.id,
            schema: p.plugin.drizzleSchema
        }));
}
