import { HttpsError } from "firebase-functions/v1/auth";
import { supabase } from "./init";
import * as functions from "firebase-functions";

export const getProfiles = functions.https.onCall(async (data, context) => {
  const uid = context.auth ? context.auth.uid : null;
  if (!uid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }

  const profilesRes = await supabase.from("profiles").select("*");

  if (profilesRes.error) {
    throw new HttpsError("internal", "Error fetching profiles");
  }

  return profilesRes.data;
});
