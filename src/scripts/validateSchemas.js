/**
 * Quick smoke-test: require every model, compile schemas, and print
 * the collection name + index definitions.  No MongoDB connection needed.
 */
const mongoose = require("mongoose");
const models = require("../models");
const hasAccess = require("../helpers/hasAccess");

console.log("═══════════════════════════════════════════════════════");
console.log("  BAMS Study Notes — Schema Validation");
console.log("═══════════════════════════════════════════════════════\n");

for (const [name, model] of Object.entries(models)) {
  const schema = model.schema;
  const paths = Object.keys(schema.paths).filter(
    (p) => !["_id", "__v"].includes(p)
  );
  const indexes = schema.indexes().map(([fields, opts]) => {
    const keys = Object.entries(fields)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    const flags = [];
    if (opts.unique) flags.push("unique");
    if (opts.sparse) flags.push("sparse");
    if (opts.expireAfterSeconds) flags.push(`TTL:${opts.expireAfterSeconds}s`);
    return `  { ${keys} }` + (flags.length ? `  [${flags.join(", ")}]` : "");
  });

  console.log(`📦  ${name}  (→ ${model.collection.collectionName})`);
  console.log(`    Fields: ${paths.join(", ")}`);
  if (indexes.length) {
    console.log(`    Indexes:`);
    indexes.forEach((idx) => console.log(`     ${idx}`));
  }
  console.log();
}

console.log(`🔑  hasAccess helper: ${typeof hasAccess === "function" ? "✅ loaded" : "❌ missing"}`);
console.log(`\n✅  All ${Object.keys(models).length} models compiled successfully.\n`);
