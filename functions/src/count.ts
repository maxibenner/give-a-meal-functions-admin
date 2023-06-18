import { HttpsError } from "firebase-functions/v1/auth";
import { supabase } from "./init";
import * as functions from "firebase-functions";

export const getCounts = functions.https.onCall(async (data, context) => {
  // Check authentication
  const uid = context.auth ? context.auth.uid : null;
  if (!uid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }

  const businessCountRes = await supabase
    .from("businesses")
    .select("*", { count: "exact", head: true });

  const verificationCountRes = await supabase
    .from("verifications")
    .select("*", { count: "exact", head: true });

  const profileCountRes = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  const donationCountRes = await supabase
    .from("donations")
    .select("*", { count: "exact", head: true });

  const itemCountRes = await supabase
    .from("items")
    .select("*", { count: "exact", head: true });

  const [
    businessCount,
    verificationCount,
    profileCount,
    donationCount,
    itemCount,
  ] = await Promise.all([
    businessCountRes,
    verificationCountRes,
    profileCountRes,
    donationCountRes,
    itemCountRes,
  ]);

  // Handle errors from promise.all
  const error =
    businessCount.error ||
    verificationCount.error ||
    profileCount.error ||
    donationCount.error ||
    itemCount.error;

  if (error) {
    throw new HttpsError("internal", "Error fetching counts");
  }

  const transformedData = [
    { title: "Businesses", count: businessCount.count },
    {
      title: "Verifications",
      count: verificationCount.count,
    },
    { title: "Profiles", count: profileCount.count },
    { title: "Donations", count: donationCount.count },
    { title: "Items", count: itemCount.count },
  ];

  return transformedData;
});
