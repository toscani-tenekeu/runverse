// Each vendor bundle adds its modules to one registry that the preview's module loader reads.
// A module is kept as the namespace object, flagged so `import X from` finds `default`.
export function register(modules: Record<string, object>) {
  const target = ((globalThis as { __rv_vendor?: Record<string, unknown> }).__rv_vendor ??= {});
  for (const [name, namespace] of Object.entries(modules)) {
    const module: Record<string, unknown> = { ...namespace, __esModule: true };
    if (!('default' in module)) module.default = namespace;
    target[name] = module;
  }
}
