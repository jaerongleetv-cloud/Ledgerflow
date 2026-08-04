import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
    })
);

if (!env.LEDGERFLOW_TEST_EMAIL || !env.LEDGERFLOW_TEST_PASSWORD) {
  throw new Error("Set LEDGERFLOW_TEST_EMAIL and LEDGERFLOW_TEST_PASSWORD in .env.local before seeding.");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { error: authError } = await supabase.auth.signInWithPassword({
  email: env.LEDGERFLOW_TEST_EMAIL,
  password: env.LEDGERFLOW_TEST_PASSWORD,
});
if (authError) throw authError;

const today = new Date().toISOString().slice(0, 10);
const { data, error } = await supabase
  .from("transactions")
  .insert({
    amount: 18,
    type: "expense",
    category: "food",
    description: "McDonalds",
    transaction_date: today,
    date: today,
    recurring_type: "normal",
  })
  .select()
  .single();

if (error) throw error;
console.log(JSON.stringify({ insertedTransactionId: data.id }, null, 2));
