import { HttpsError } from "firebase-functions/v1/auth";
import { supabase } from "./init";
import * as functions from "firebase-functions";

export const getVerifications = functions.https.onCall(
  async (data, context) => {
    // Check authentication
    const uid = context.auth ? context.auth.uid : null;
    if (!uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The function must be called while authenticated."
      );
    }

    const verificationsRes = await supabase.from("verifications").select("*");

    if (verificationsRes.error) {
      throw new HttpsError("internal", "Error fetching verifications");
    }

    return verificationsRes.data;
  }
);
