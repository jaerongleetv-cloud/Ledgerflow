import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SCOPE = "aemeath:ledgerflow:transactions:read";
const env = loadEnv();
const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [command, ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);

if (command === "create") {
  const userId = await resolveUserId(args);
  const name = args.name || "Aemeath P9C";
  const expiresAt = parseExpiration(args["expires-at"]);
  const token = `lf_aem_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data, error } = await supabase.from("integration_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    name,
    scope: SCOPE,
    expires_at: expiresAt,
  }).select("id, user_id, name, scope, created_at, expires_at").single();
  if (error) fail(`Token creation failed: ${error.message}`);

  console.log(JSON.stringify({ ...data, token }, null, 2));
  console.error("Store the token in Aemeath now. LedgerFlow cannot display it again.");
} else if (command === "revoke") {
  const tokenId = args["token-id"];
  if (!tokenId) fail("Usage: npm run aemeath:token:revoke -- --token-id <uuid>");
  const { data, error } = await supabase
    .from("integration_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("revoked_at", null)
    .select("id, name, revoked_at")
    .maybeSingle();
  if (error) fail(`Token revocation failed: ${error.message}`);
  if (!data) fail("No active integration token matched that id.");
  console.log(JSON.stringify(data, null, 2));
} else {
  fail("Use create or revoke. See docs/aemeath-ledgerflow-api.md.");
}

async function resolveUserId(values) {
  if (values["user-id"]) return values["user-id"];
  if (!values.email) fail("Create requires --user-id <uuid> or --email <address>.");
  let page = 1;
  while (page <= 100) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`User lookup failed: ${error.message}`);
    const matches = data.users.filter((user) => user.email?.toLowerCase() === values.email.toLowerCase());
    if (matches.length === 1) return matches[0].id;
    if (data.users.length < 1000) break;
    page += 1;
  }
  fail("No unique LedgerFlow user matched that email.");
}

function parseExpiration(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) fail("--expires-at must be a future ISO-8601 timestamp.");
  return date.toISOString();
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("Arguments must use --name value format.");
    result[key.slice(2)] = value;
  }
  return result;
}

function loadEnv() {
  if (!fs.existsSync(".env.local")) return {};
  return Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
    }));
}

function required(name) {
  const value = process.env[name] || env[name];
  if (!value) fail(`Missing ${name}.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
