import * as functions from "firebase-functions";
import { supabase } from "./init";
const https = require("node:http");

/**
 * Start timer for claim removal
 */
export const cancelReservationCallback = functions.https.onRequest(
  async (req: any, res: any) => {
    const { donationId, queuePin } = req.body;

    if (queuePin === functions.config().general.queue_pin) {
      await supabase
        .from("donations")
        .update({ claimed_by: null })
        .eq("id", donationId);

      console.log(`Removed claim from donation ${donationId}`);

      return res.end();
    } else {
      console.log("Unable to remove claim. Invalid queue pin.");

      return res.end();
    }
  }
);

/**
 * Create unique string
 * @return {string} Rather unique string
 */
export function generateRandomString() {
  let result;
  let i;
  let j;
  result = "";
  for (j = 0; j < 32; j++) {
    if (j == 8 || j == 12 || j == 16 || j == 20) result = result + "-";
    i = Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase();
    result = result + i;
  }
  return result;
}

/**
 * Turns snake case objects keys into camel case object keys
 * @param {Object} o Object with snake case keys
 * @return {Object} Object with all keys in camelCase
 */
export function keysToCamel(o: any) {
  const isArray = function (a: any) {
    return Array.isArray(a);
  };

  const isObject = function (o: any) {
    return o === Object(o) && !isArray(o) && typeof o !== "function";
  };

  const toCamel = (s: any) => {
    return s.replace(/([-_][a-z])/gi, ($1: any) => {
      return $1.toUpperCase().replace("-", "").replace("_", "");
    });
  };

  if (isObject(o)) {
    const n: any = {};

    Object.keys(o).forEach((k) => {
      n[toCamel(k)] = keysToCamel(o[k]);
    });

    return n;
  } else if (isArray(o)) {
    return o.map((i: any) => {
      return keysToCamel(i);
    });
  }

  return o;
}

/**
 * Get business details from google maps api
 * @param {string} placeId Id of place on google
 */
export async function getBusinessDetailsFromGoogle(placeId: string) {
  const mapsApiKey = functions.config().google_maps.key;

  const options = {
    hostname: "maps.googleapis.com",
    path: `/maps/api/place/details/json?fields=geometry,address_components,international_phone_number,website,business_status,name&place_id=${placeId}&key=${mapsApiKey}`,
  };

  // Request places for provided query from maps api
  const detailsPromise = new Promise((resolve) => {
    https
      .get(options, (res: any) => {
        let str = "";
        res.on("data", (d: string) => {
          str += d;
        });
        res.on("end", () => {
          resolve(JSON.parse(str));
        });
      })
      .on("error", (e: any) => {
        return null;
      });
  });
  const res: any = await detailsPromise;

  if (!res) return null;

  // Reduce into usable object
  const addressComponents = res.result.address_components;
  const formattedComponents = addressComponents.reduce(
    (acc: any, component: any) => {
      if (component.types.includes("locality")) {
        acc.city = component.long_name;
      } else if (component.types.includes("administrative_area_level_1")) {
        acc.state = component.short_name;
      } else if (component.types.includes("country")) {
        acc.country = component.long_name;
      } else if (component.types.includes("postal_code")) {
        acc.postalCode = component.long_name;
      } else if (component.types.includes("route")) {
        acc.address = component.long_name;
      } else if (component.types.includes("street_number")) {
        acc.streetNumber = component.long_name;
      }
      return acc;
    },
    {}
  );

  // Add other attributes and return
  return {
    address: formattedComponents,
    location: res.result.geometry.location,
    businessStatus: res.result.business_status,
    internationalPhoneNumber: res.result.international_phone_number ?? null,
    website: res.result.website ?? null,
    placeId: placeId,
    name: res.result.name,
  };
}
