import { HttpsError } from "firebase-functions/v1/auth";
import { admin, supabase } from "./init";
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

    const verificationsRes: any = await supabase
      .from("verifications")
      .select("*");

    if (verificationsRes.error) {
      throw new HttpsError("internal", "Error fetching verifications");
    }

    const verifiedVerifications = [];

    for (let i = 0; i < verificationsRes.data.length; i++) {
      if (!verificationsRes.data[i].auth_id) {
        continue;
      }
      const user = await admin.auth().getUser(uid);
      verifiedVerifications.push({
        ...verificationsRes.data[i],
        user_email: user.email,
      });
    }

    return verifiedVerifications;
  }
);
