import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
admin.initializeApp();

import { createClient } from "@supabase/supabase-js";
const supabaseUrl = functions.config().supabase.url;
const supabaseKey = functions.config().supabase.key;

const supabase = createClient(supabaseUrl, supabaseKey);

export { admin, supabase };
