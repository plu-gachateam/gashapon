import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

admin.initializeApp();

const db = admin.firestore();

// Helper Functions
/**
 * Simple guard function that asserts user authentication.
 * @param {functions.https.CallableContext} context
 * @throws HttpsError if the user is not authenticated
 */
function checkAuthentication(context : functions.https.CallableContext) {
  if (!context.auth) {
    // Throw an error if not
    throw new functions.https.HttpsError("unauthenticated",
        "The function must be called " +
        "while authenticated.");
  }
}

/**
 * Checks whether user account data exists in Firestore for the given uid.
 * @param {string} uid user id
 * @return {Promise<boolean>} true if user account data exists
 */
async function accountExists(uid : string) : Promise<boolean> {
  const docRef = db.collection("users").doc(uid);

  return docRef.get().then((doc) => {
    return doc.exists;
  })
      .catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("unknown", error);
      });
}


// Endpoint Functions
/**
 * Example function for development reference.
 * res.json() to send back JSON data.
 * res.send() if you want to return plain html inside a string.
 * res.status(200).json() if you want to send a
 * status code (change 200 to any code you want).
 * Look up documentation on Express endpoints for more info.
 *
 * To test your functions in an emulator, run
 * `npm run build` in the functions directory (to compile ts code)
 * and `firebase emulators:start` in the gashapon directory.
 *
 * Alternatively: `npm run func` in the gashapon directory.
 */
export const helloWorld = functions.https.onRequest(async (req, res) => {
  res.json({data: "World!"});
});


/**
 * Example function for GET requests using onRequest.
 * Note that onRequest can send explicit status codes,
 * while onCall must return a dictionary in JSON format.
 */
export const getExample = functions.https.onRequest(async (req, res) => {
  db.doc("/ticket-info/shopname").get()
      .then((snapshot) => {
        const data = snapshot.data();
        res.send(data);
      })
      .catch((error) => {
        console.log(error);
        res.status(500).send(error);
      });
});


/**
 * Called when a user logs in or creates a new account and \
 * performs any required operations.
 * @returns "created" result status if a new account was created,
 * "success" otherwise (i.e. if no new account created).
 */
export const userLoggedIn = functions.https.onCall(async (data, context) => {
  // Check if the user is authenticated
  checkAuthentication(context);

  // Get the user's id and email
  const uid = context.auth?.uid as string;
  const email = await admin.auth().getUser(uid)
      .then((userRecord) => {
        return userRecord.email as string;
      });

  // Initialize the account if it's new
  const newAccountCreated = await initUserAccount(uid, email);
  if (newAccountCreated) {
    return {result: "created"};
  } else {
    return {result: "success"};
  }
});


/**
 * Initializes user data in the Firestore database with default information.
 * Helper function for {@link userLoggedIn}.
 * @param {string} uid
 * @param {string} email
 * @return {Promise<boolean>} true if a new account had to be initialized
 */
async function initUserAccount(uid : string, email : string): Promise<boolean> {
  // Check if account data exists already
  if (await accountExists(uid)) {
    return false;
  }

  // Create a default shop tag from the user's email
  const emailPrefix = email.split("@")[0];
  const numChars = emailPrefix.length >= 5 ? 5 : emailPrefix.length;
  const defaultTag = emailPrefix.substring(0, numChars).toLowerCase();

  // Put the data entry together
  const timestamp = await admin.firestore.FieldValue.serverTimestamp();
  const userData = {
    createdAt: timestamp,
    shopTag: defaultTag,
  };

  // Write to firestore
  await db.collection("users").doc(uid).set(userData)
      .catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("unknown", error);
      });

  return true;
}


export const generateTickets = functions.https.onCall(async (data, context) => {
  // Data
  const email = data.email;
  const memo = data.memo;
  const amount = data.amount;

  // Check if user is authenticated
  checkAuthentication(context);

  // Check the amount variable is within range
  if (amount > 10 || amount < 1) {
    throw new functions.https.HttpsError("out-of-range",
        "A minimum of 1 and a maximum of 10 tickets " +
      "can be generated at a time.");
  }

  // Grab user info (id and shop tag)
  const uid = context.auth?.uid;
  const shopTag = await db.doc(`/users/${uid}`).get()
      .then((snapshot) => {
        const data = snapshot.data() as FirebaseFirestore.DocumentData;
        return data.shopTag as string;
      })
      .catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("unknown", error);
      });

  // Generate ticket data
  const tickets : any = {};
  const timestamp = await admin.firestore.FieldValue.serverTimestamp();
  for (let i = 0; i < amount; i++) {
    // Generate a unique code
    let suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    let code = `${shopTag}-${suffix}`;
    let ticketPath = `/ticket-info/${code}`;
    while ((await db.doc(ticketPath).get()).exists) { // avoids duplicates
      suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
      code = `${shopTag}-${suffix}`;
      ticketPath = `/ticket-info/${code}`;
    }

    // Create the JSON object
    const ticketData = {
      createdAt: timestamp,
      email,
      memo,
      orderID: null,
      prizeID: null,
      redeemed: false,
      shipped: false,
    };

    // Write to firestore
    db.collection("ticket-info").doc(code).set(ticketData)
        .catch((error) => {
          console.log(error);
          throw new functions.https.HttpsError("unknown", error);
        });

    // Append to list
    tickets[code] = ticketData;
  }

  return tickets;
});


// add imageURL to prize-info fields
export const addNewPrize = functions.https.onCall(async (data, context) => {
  // Data
  const name = data.name;
  const description = data.description;
  const quantity = parseInt(data.quantity);
  const url = data.image;

  // Check if user is authenticated
  if (!context.auth) {
    // Throw an error if not
    throw new functions.https.HttpsError("unauthenticated",
        "The function must be called " +
      "while authenticated.");
  }
  // Check the amount variable is within range
  if (quantity < 0 || quantity > 999) {
    throw new functions.https.HttpsError("out-of-range",
        "Prize quantity must be between 0 and 999 (inclusive)");
  }

  // Generate prize data
  const timestamp = await admin.firestore.FieldValue.serverTimestamp();

  const prizeMetaData = {
    createdAt: timestamp,
    creatorUserID: context.auth.uid,
    quantity,
  };

  const prizeInfoData = {
    description,
    image: url,
    name,
    lastModified: timestamp,
  };

  // Write both documents to firestore
  let id;
  await db.collection("prizes").add(prizeMetaData)
      .then((docRef) => {
        id = docRef.id;
        db.collection("prize-info").doc(id).set(prizeInfoData)
            .catch((error) => {
              console.log(error);
              throw new functions.https.HttpsError("unknown", error);
            });
      })
      .catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("unknown", error);
      });

  // Append to list
  return {id, prizeMetaData, prizeInfoData};
});
