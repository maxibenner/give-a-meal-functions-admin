import { HttpsError } from "firebase-functions/v1/auth";
import { admin, supabase } from "./init";
import * as functions from "firebase-functions";
import { getBusinessDetailsFromGoogle, keysToCamel } from "./utils";

/**
 * Get all pending admin phone verifications
 * @returns {Array} - An array of pending verifications
 * @throws {functions.https.HttpsError} - Throws if the user is not authenticated
 * @throws {functions.https.HttpsError} - Throws if there is an error fetching verifications
 */
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
      .select("*")
      .eq("verification_mode", "phone")
      .eq("connection_type", "admin");

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

/**
 * Get a specific pending admin phone verification
 * @param {string} verificationId - The id of the verification to fetch
 * @returns {Object} - The verification object
 * @throws {functions.https.HttpsError} - Throws if the user is not authenticated
 * @throws {functions.https.HttpsError} - Throws if the request is missing the verificationId parameter
 * @throws {functions.https.HttpsError} - Throws if there is an error fetching the verification
 * @throws {functions.https.HttpsError} - Throws if there is an error fetching the business from google places API
 */
export const getVerification = functions.https.onCall(async (data, context) => {
  // Check authentication
  const uid = context.auth ? context.auth.uid : null;

  if (!uid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }

  // Make sure request is properly formatted and includes required parameters
  if (!data.verificationId)
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing parameter verificationId."
    );

  const verificationRes: any = await supabase
    .from("verifications")
    .select("*")
    .eq("id", data.verificationId);

  if (verificationRes.error) {
    throw new HttpsError("internal", "Error fetching verification");
  }

  if (verificationRes.data.length === 0) {
    throw new HttpsError("internal", "Couldnt find verification");
  }

  const details: any = await getBusinessDetailsFromGoogle(
    verificationRes.data[0].place_id
  );

  if (!details || !details.website)
    throw new functions.https.HttpsError(
      "unavailable",
      "Couldn't find business on Google places API"
    );

  const user = await admin.auth().getUser(uid);

  verificationRes.data[0].user_email = user.email;

  // Add business details to response
  verificationRes.data[0].address = {
    business_name: details.name,
    address: details.address.address,
    street_number: details.address.streetNumber,
    city: details.address.city,
    postal_code: details.address.postalCode,
    state: details.address.state,
    country: details.address.country,
    lat: details.location.lat,
    lon: details.location.lng,
  };

  return keysToCamel(verificationRes.data[0]);
});

/**
 * Accept a pending admin phone verification
 * @param {string} verificationId - The id of the verification to accept
 * @returns {Object} - The connection object
 * @throws {functions.https.HttpsError} - Throws if the user is not authenticated
 * @throws {functions.https.HttpsError} - Throws if the request is missing the verificationId parameter
 */
export const acceptBusinessRequest = functions.https.onCall(
  async (data, context) => {
    // Check authentication
    const uid = context.auth ? context.auth.uid : null;
    if (!uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The function must be called while authenticated."
      );
    }

    // Make sure request is properly formatted and includes required parameters
    if (!data.verificationId)
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing parameter verificationId."
      );

    // Get auth_id from verification
    const verificationRes: any = await supabase
      .from("verifications")
      .select("*")
      .eq("id", data.verificationId);

    if (verificationRes.error) {
      throw new HttpsError("internal", "Error fetching verification");
    }

    // Get business details
    const details: any = await getBusinessDetailsFromGoogle(
      verificationRes.data[0].place_id
    );
    if (!details || !details.website)
      throw new functions.https.HttpsError(
        "unavailable",
        "Failed to fetch business details."
      );

    // Insert entries
    const businessPromise = new Promise((resolve, reject) => {
      const data = {
        place_id: verificationRes.data[0].auth_id,
        business_name: details.name,
        address: details.address.address,
        street_number: details.address.streetNumber,
        city: details.address.city,
        postal_code: details.address.postalCode,
        state: details.address.state,
        country: details.address.country,
        lat: details.location.lat,
        lon: details.location.lng,
      };

      supabase
        .from("businesses")
        .insert(data)
        .select()
        .limit(1)
        .single()
        .then((res) => {
          if (res.status > 199 && res.status < 300) resolve(res.data);
          else
            throw new functions.https.HttpsError(
              "internal",
              res.error?.message ?? "Failed to insert business entry."
            );
        });
    });

    const profilePromise = new Promise((resolve, reject) => {
      const data = {
        auth_id: verificationRes.data[0].auth_id,
        email: verificationRes.data[0].verification_email,
      };
      supabase
        .from("profiles")
        .insert(data)
        .select()
        .limit(1)
        .single()
        .then((res) => {
          if (res.status > 199 && res.status < 300) resolve(res.data);
          else
            throw new functions.https.HttpsError(
              "internal",
              res.error?.message ?? "Failed to insert profile entry."
            );
        });
    });

    const [businessRes, profileRes] = await Promise.all<[any, any]>([
      businessPromise,
      profilePromise,
    ]);

    const connectionsRes = await supabase
      .from("business_connections")
      .insert({
        connection_type: "admin",
        business: businessRes.id,
        profile: profileRes.id,
      })
      .select("*, business!inner(*), profile(*)")
      .limit(1)
      .single();

    if (connectionsRes.error)
      throw new functions.https.HttpsError(
        "internal",
        connectionsRes.error.message
      );

    // Remove verification entry
    const verificationDeleteRes = await supabase
      .from("verifications")
      .delete()
      .eq("id", verificationRes.data[0].id)
      .single();

    if (verificationDeleteRes.error)
      throw new functions.https.HttpsError(
        "internal",
        verificationDeleteRes.error.message
      );

    return keysToCamel(connectionsRes.data);
  }
);

/**
 * Decline a pending admin phone verification
 * @param {string} verificationId - The id of the verification to decline
 * @returns {void}
 * @throws {functions.https.HttpsError} - Throws if the user is not authenticated
 * @throws {functions.https.HttpsError} - Throws if the request is missing the verificationId parameter
 * @throws {functions.https.HttpsError} - Throws if the verification entry could not be deleted
 */
export const declineBusinessRequest = functions.https.onCall(
  async (data, context) => {
    // Check authentication
    const uid = context.auth ? context.auth.uid : null;
    if (!uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The function must be called while authenticated."
      );
    }

    // Make sure request is properly formatted and includes required parameters
    if (!data.verificationId)
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing parameter verificationId."
      );

    // Remove verification entry
    const verificationRes = await supabase
      .from("verifications")
      .delete()
      .eq("id", data.verificationId)
      .single();

    if (verificationRes.error)
      throw new functions.https.HttpsError(
        "internal",
        verificationRes.error.message
      );

    return;
  }
);
