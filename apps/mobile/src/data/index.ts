import type { Backend } from "./backend";
import { DemoBackend } from "./demo";
import { SupabaseBackend } from "./supabase";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Real backend when configured; otherwise demo mode (labelled in the UI). */
export const backend: Backend = url && key ? new SupabaseBackend(url, key) : new DemoBackend();

export * from "./backend";
