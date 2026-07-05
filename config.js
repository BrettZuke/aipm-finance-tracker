// ---------------------------------------------------------------------------
// Finance Tracker configuration
//
// Fill in the values below with details from YOUR OWN Supabase project.
// Full step-by-step instructions are in README.md.
//
// None of these values are secret. The Supabase "anon" key is designed to be
// public and shipped in the browser; your data is protected by Row Level
// Security (see schema.sql), which only lets a signed-in user read their own
// rows. The real secret (your AI provider key) lives on the server, never here.
// ---------------------------------------------------------------------------
window.APP_CONFIG = {
  // Supabase dashboard: Project Settings > API
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",

  // OPTIONAL. Only needed for the AI features (reading PDF statements + the
  // finance chat). Leave it as "" to run the tracker without AI. To enable it,
  // deploy the function in ai-backend/ and paste its URL here. See README.md.
  AI_URL: ""
};
